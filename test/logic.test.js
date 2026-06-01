// describe/it/expect are provided as globals by Vitest (globals: true).
const {
  formatSliderValue,
  clampDualRange,
  dualFillPercents,
  sliderFillPercent,
  parseKeywords,
  formatKeywords,
  parseTinderHeading,
} = require('../logic.js');

describe('formatSliderValue', () => {
  it('shows "Unlimited" for swipe/daily limit at 0', () => {
    expect(formatSliderValue('swipeLimit', 0)).toBe('Unlimited');
    expect(formatSliderValue('dailyLimit', 0)).toBe('Unlimited');
  });

  it('shows the count with "swipes" for non-zero swipe/daily limit', () => {
    expect(formatSliderValue('swipeLimit', 200)).toBe('200 swipes');
    expect(formatSliderValue('dailyLimit', 1500)).toBe('1500 swipes');
  });

  it('shows "Off" for break/gap interval at 0', () => {
    expect(formatSliderValue('breakInterval', 0)).toBe('Off');
    expect(formatSliderValue('sessionGapInterval', 0)).toBe('Off');
  });

  it('shows "every N" for non-zero break/gap interval', () => {
    expect(formatSliderValue('breakInterval', 50)).toBe('every 50');
    expect(formatSliderValue('sessionGapInterval', 40)).toBe('every 40');
  });

  it('appends "s" to break duration', () => {
    expect(formatSliderValue('breakDuration', 30)).toBe('30s');
  });

  it('shows "Any" for max distance / min photos at 0, value otherwise', () => {
    expect(formatSliderValue('maxDistance', 0)).toBe('Any');
    expect(formatSliderValue('maxDistance', 75)).toBe('75 km');
    expect(formatSliderValue('minPhotos', 0)).toBe('Any');
    expect(formatSliderValue('minPhotos', 3)).toBe('3');
  });

  it('treats non-numeric input as 0', () => {
    expect(formatSliderValue('swipeLimit', '')).toBe('Unlimited');
    expect(formatSliderValue('maxDistance', 'abc')).toBe('Any');
  });

  it('falls back to the raw value for unknown ids', () => {
    expect(formatSliderValue('somethingElse', 7)).toBe('7');
  });
});

describe('clampDualRange', () => {
  it('leaves a valid range untouched', () => {
    expect(clampDualRange(25, 40, 'min')).toEqual({ lo: 25, hi: 40 });
    expect(clampDualRange(25, 40, 'max')).toEqual({ lo: 25, hi: 40 });
  });

  it('pushes max up to meet min when the min thumb crosses over', () => {
    expect(clampDualRange(60, 50, 'min')).toEqual({ lo: 60, hi: 60 });
  });

  it('pulls min down to meet max when the max thumb crosses over', () => {
    expect(clampDualRange(60, 50, 'max')).toEqual({ lo: 50, hi: 50 });
  });

  it('allows equal values (lo === hi)', () => {
    expect(clampDualRange(30, 30, 'min')).toEqual({ lo: 30, hi: 30 });
  });

  it('coerces non-numeric input to 0', () => {
    expect(clampDualRange('x', 'y', 'min')).toEqual({ lo: 0, hi: 0 });
  });
});

describe('dualFillPercents', () => {
  it('computes left/right insets across the track', () => {
    // age 18..99, range 25..40
    const p = dualFillPercents(25, 40, 18, 99);
    expect(p.left).toBeCloseTo((7 / 81) * 100, 4);
    expect(p.right).toBeCloseTo(100 - (22 / 81) * 100, 4);
  });

  it('is 0/0 when the range spans the whole track', () => {
    const p = dualFillPercents(0, 100, 0, 100);
    expect(p.left).toBe(0);
    expect(p.right).toBe(0);
  });

  it('avoids divide-by-zero when min === max bound', () => {
    const p = dualFillPercents(5, 5, 5, 5);
    expect(Number.isFinite(p.left)).toBe(true);
    expect(Number.isFinite(p.right)).toBe(true);
  });
});

describe('sliderFillPercent', () => {
  it('maps value to a 0..100 percentage', () => {
    expect(sliderFillPercent(50, 0, 100)).toBe(50);
    expect(sliderFillPercent(0, 0, 100)).toBe(0);
    expect(sliderFillPercent(100, 0, 100)).toBe(100);
  });

  it('handles non-zero min', () => {
    expect(sliderFillPercent(3, 1, 10)).toBeCloseTo((2 / 9) * 100, 4);
  });

  it('avoids divide-by-zero', () => {
    expect(Number.isFinite(sliderFillPercent(5, 5, 5))).toBe(true);
  });
});

describe('parseKeywords / formatKeywords', () => {
  it('splits, trims, and drops empty entries', () => {
    expect(parseKeywords('travel, music ,, hiking')).toEqual(['travel', 'music', 'hiking']);
  });

  it('returns an empty array for empty / falsy input', () => {
    expect(parseKeywords('')).toEqual([]);
    expect(parseKeywords(null)).toEqual([]);
    expect(parseKeywords(undefined)).toEqual([]);
  });

  it('joins an array back into a comma string', () => {
    expect(formatKeywords(['travel', 'music'])).toBe('travel, music');
  });

  it('returns an empty string for non-array input', () => {
    expect(formatKeywords(null)).toBe('');
    expect(formatKeywords('nope')).toBe('');
  });

  it('round-trips a keyword string', () => {
    const s = 'a, b, c';
    expect(formatKeywords(parseKeywords(s))).toBe(s);
  });
});

describe('parseTinderHeading (fixes "Unknown / ?" scraping)', () => {
  it('splits "Meera 23" into name and age', () => {
    expect(parseTinderHeading('Meera 23')).toEqual({ name: 'Meera', age: '23' });
  });

  it('handles trailing whitespace and collapsed spaces', () => {
    expect(parseTinderHeading('  Meera   23  ')).toEqual({ name: 'Meera', age: '23' });
  });

  it('keeps multi-word names intact', () => {
    expect(parseTinderHeading('Mary Jane 27')).toEqual({ name: 'Mary Jane', age: '27' });
  });

  it('handles accented names', () => {
    expect(parseTinderHeading('Zoë 21')).toEqual({ name: 'Zoë', age: '21' });
  });

  it('returns "?" age when no number is present', () => {
    expect(parseTinderHeading('Meera')).toEqual({ name: 'Meera', age: '?' });
  });

  it('returns empty name + "?" for empty input', () => {
    expect(parseTinderHeading('')).toEqual({ name: '', age: '?' });
    expect(parseTinderHeading(null)).toEqual({ name: '', age: '?' });
    expect(parseTinderHeading(undefined)).toEqual({ name: '', age: '?' });
  });
});
