/**
 * Region Post-Processor — Validates, merges, and deduplicates LLM translation regions.
 *
 * Runs between the API response and rendering to fix common LLM output issues:
 * 1. Inverted coordinates (ymin > ymax)
 * 2. Micro-regions (single characters that should be grouped)
 * 3. Overlapping/near-duplicate regions
 * 4. Out-of-bounds coordinates
 */

(function () {
  "use strict";

  // ── Configuration ────────────────────────────────────────────

  const MERGE_CONFIG = {
    // Minimum box dimension on the 1000-point scale to keep a region standalone.
    // Regions smaller than this in BOTH width AND height are candidates for merging.
    MIN_BOX_DIM: 50,

    // Maximum gap (on 1000-scale) between regions to consider them part of the same group.
    // For vertical text columns: regions sharing similar X but stacked vertically.
    MERGE_PROXIMITY_AXIS: 60,    // Tolerance on the shared axis (e.g., X for vertical columns)
    MERGE_PROXIMITY_GAP: 120,    // Max gap on the flow axis (e.g., Y gap between vertical chars)

    // Overlap threshold: if two regions overlap by this fraction of the smaller region, merge.
    OVERLAP_RATIO: 0.3,

    // Text deduplication: identical bounding boxes with same text.
    DEDUP_COORD_TOLERANCE: 5
  };

  // ── Step 1: Fix Inverted Coordinates ─────────────────────────

  function fixCoordinates(region) {
    const r = { ...region };

    // Swap inverted X
    if (r.box_xmin_1000 > r.box_xmax_1000) {
      [r.box_xmin_1000, r.box_xmax_1000] = [r.box_xmax_1000, r.box_xmin_1000];
    }

    // Swap inverted Y
    if (r.box_ymin_1000 > r.box_ymax_1000) {
      [r.box_ymin_1000, r.box_ymax_1000] = [r.box_ymax_1000, r.box_ymin_1000];
    }

    // Clamp to valid range [0, 1000]
    r.box_xmin_1000 = Math.max(0, Math.min(1000, r.box_xmin_1000));
    r.box_ymin_1000 = Math.max(0, Math.min(1000, r.box_ymin_1000));
    r.box_xmax_1000 = Math.max(0, Math.min(1000, r.box_xmax_1000));
    r.box_ymax_1000 = Math.max(0, Math.min(1000, r.box_ymax_1000));

    return r;
  }

  // ── Step 2: Deduplicate Exact/Near-Duplicates ────────────────

  function deduplicateRegions(regions) {
    const tol = MERGE_CONFIG.DEDUP_COORD_TOLERANCE;
    const result = [];

    for (const region of regions) {
      const isDup = result.some(existing =>
        Math.abs(existing.box_xmin_1000 - region.box_xmin_1000) <= tol &&
        Math.abs(existing.box_ymin_1000 - region.box_ymin_1000) <= tol &&
        Math.abs(existing.box_xmax_1000 - region.box_xmax_1000) <= tol &&
        Math.abs(existing.box_ymax_1000 - region.box_ymax_1000) <= tol
      );
      if (!isDup) {
        result.push(region);
      }
    }

    return result;
  }

  // ── Step 3: Identify Micro-Regions ───────────────────────────

  function isMicroRegion(region) {
    const w = region.box_xmax_1000 - region.box_xmin_1000;
    const h = region.box_ymax_1000 - region.box_ymin_1000;
    return w < MERGE_CONFIG.MIN_BOX_DIM && h < MERGE_CONFIG.MIN_BOX_DIM;
  }

  // ── Step 4: Merge Fragmented Regions ─────────────────────────

  /**
   * Groups micro-regions that share a similar axis position (vertical or horizontal columns).
   * For vertical Japanese text, characters share similar X coords but are stacked on Y.
   * For horizontal text, characters share similar Y coords but spread on X.
   */
  function mergeFragmentedRegions(regions) {
    const standalone = [];
    const candidates = [];

    // Separate micro-regions (merge candidates) from standalone regions
    for (const r of regions) {
      if (isMicroRegion(r)) {
        candidates.push(r);
      } else {
        standalone.push(r);
      }
    }

    if (candidates.length === 0) return regions;

    // Group candidates by proximity
    const groups = [];
    const used = new Set();

    for (let i = 0; i < candidates.length; i++) {
      if (used.has(i)) continue;

      const group = [candidates[i]];
      used.add(i);

      // Find all connected candidates
      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < candidates.length; j++) {
          if (used.has(j)) continue;
          if (isNearGroup(candidates[j], group)) {
            group.push(candidates[j]);
            used.add(j);
            changed = true;
          }
        }
      }

      groups.push(group);
    }

    // Merge each group into a single region
    for (const group of groups) {
      if (group.length === 1) {
        // Single micro-region — keep as-is (might be a small SFX)
        standalone.push(group[0]);
        continue;
      }

      const merged = mergeGroup(group);
      standalone.push(merged);
    }

    return standalone;
  }

  /**
   * Check if a candidate region is near any region already in the group.
   */
  function isNearGroup(candidate, group) {
    for (const member of group) {
      if (areNearby(candidate, member)) return true;
    }
    return false;
  }

  /**
   * Check if two regions are nearby (share an axis within tolerance, close on the other).
   */
  function areNearby(a, b) {
    const axTol = MERGE_CONFIG.MERGE_PROXIMITY_AXIS;
    const gapTol = MERGE_CONFIG.MERGE_PROXIMITY_GAP;

    // Vertical column check: similar X range, stacked on Y
    const aCenterX = (a.box_xmin_1000 + a.box_xmax_1000) / 2;
    const bCenterX = (b.box_xmin_1000 + b.box_xmax_1000) / 2;
    const aCenterY = (a.box_ymin_1000 + a.box_ymax_1000) / 2;
    const bCenterY = (b.box_ymin_1000 + b.box_ymax_1000) / 2;

    const xClose = Math.abs(aCenterX - bCenterX) <= axTol;
    const yGap = Math.abs(aCenterY - bCenterY);
    if (xClose && yGap <= gapTol) return true;

    // Horizontal row check: similar Y range, spread on X
    const yClose = Math.abs(aCenterY - bCenterY) <= axTol;
    const xGap = Math.abs(aCenterX - bCenterX);
    if (yClose && xGap <= gapTol) return true;

    // Overlap check
    if (regionsOverlap(a, b)) return true;

    return false;
  }

  /**
   * Check if two regions overlap significantly.
   */
  function regionsOverlap(a, b) {
    const overlapX = Math.max(0,
      Math.min(a.box_xmax_1000, b.box_xmax_1000) - Math.max(a.box_xmin_1000, b.box_xmin_1000)
    );
    const overlapY = Math.max(0,
      Math.min(a.box_ymax_1000, b.box_ymax_1000) - Math.max(a.box_ymin_1000, b.box_ymin_1000)
    );
    const overlapArea = overlapX * overlapY;

    const areaA = (a.box_xmax_1000 - a.box_xmin_1000) * (a.box_ymax_1000 - a.box_ymin_1000);
    const areaB = (b.box_xmax_1000 - b.box_xmin_1000) * (b.box_ymax_1000 - b.box_ymin_1000);
    const minArea = Math.min(areaA, areaB);

    return minArea > 0 && (overlapArea / minArea) >= MERGE_CONFIG.OVERLAP_RATIO;
  }

  /**
   * Merge a group of regions into a single combined region.
   * Bounding box is the union. Text is concatenated (sorted by position).
   */
  function mergeGroup(group) {
    // Sort by position: primarily by Y (top to bottom), then by X (right to left for Japanese vertical)
    group.sort((a, b) => {
      const ay = a.box_ymin_1000;
      const by = b.box_ymin_1000;
      if (Math.abs(ay - by) > 30) return ay - by;
      // Same row — sort by X (for horizontal text: left to right)
      return a.box_xmin_1000 - b.box_xmin_1000;
    });

    // Compute the union bounding box
    const merged = {
      box_xmin_1000: Math.min(...group.map(r => r.box_xmin_1000)),
      box_ymin_1000: Math.min(...group.map(r => r.box_ymin_1000)),
      box_xmax_1000: Math.max(...group.map(r => r.box_xmax_1000)),
      box_ymax_1000: Math.max(...group.map(r => r.box_ymax_1000)),
      fromLang: {
        code: group[0].fromLang?.code || "auto",
        text: group.map(r => r.fromLang?.text || "").join("")
      },
      toLang: {
        code: group[0].toLang?.code || "en-US",
        text: combineMergedTranslations(group)
      }
    };

    return merged;
  }

  /**
   * Intelligently combine translations from merged fragments.
   * If fragments are single characters/romanizations, join without spaces.
   * If they look like words/phrases, join with spaces.
   */
  function combineMergedTranslations(group) {
    const texts = group.map(r => (r.toLang?.text || "").trim()).filter(t => t.length > 0);

    if (texts.length === 0) return "";
    if (texts.length === 1) return texts[0];

    // Check if most fragments are single short items (likely romanized characters)
    const shortCount = texts.filter(t => t.length <= 3).length;
    const isFragmented = shortCount > texts.length * 0.6;

    if (isFragmented) {
      // These are likely individual characters the LLM romanized — drop the periods
      // and find if any fragment has a real translation
      const cleaned = texts.map(t => t.replace(/\.$/, "").trim()).filter(t => t.length > 0);

      // Check if any single fragment contains the full translation
      const longest = texts.reduce((a, b) => a.length > b.length ? a : b, "");
      if (longest.length > 10) return longest;

      return cleaned.join("");
    }

    // Regular phrases — join with spaces, avoid duplicates
    const unique = [...new Set(texts)];
    return unique.join(" ");
  }

  // ── Step 5: Filter Zero-Area Regions ─────────────────────────

  function filterInvalidRegions(regions) {
    return regions.filter(r => {
      const w = r.box_xmax_1000 - r.box_xmin_1000;
      const h = r.box_ymax_1000 - r.box_ymin_1000;

      // Must have positive area
      if (w <= 0 || h <= 0) return false;

      // Must have translation text
      const text = r.toLang?.text?.trim();
      if (!text) return false;

      return true;
    });
  }

  // ── Main Pipeline ────────────────────────────────────────────

  /**
   * Process raw LLM regions through the validation/merge pipeline.
   * @param {Array} regions — Raw region array from LLM API response
   * @returns {Array} — Cleaned, merged, deduplicated regions
   */
  function processRegions(regions) {
    if (!Array.isArray(regions) || regions.length === 0) return [];

    let processed = regions;

    // 1. Fix inverted/out-of-bounds coordinates
    processed = processed.map(fixCoordinates);

    // 2. Filter zero-area and empty-text regions
    processed = filterInvalidRegions(processed);

    // 3. Deduplicate near-identical regions
    processed = deduplicateRegions(processed);

    // 4. Merge fragmented micro-regions
    processed = mergeFragmentedRegions(processed);

    // 5. Final cleanup pass
    processed = filterInvalidRegions(processed);

    console.log(`[MangaTL] Region processor: ${regions.length} raw → ${processed.length} processed`);
    return processed;
  }

  // Expose globally for content.js
  window.MangaTLRegionProcessor = { processRegions };

})();
