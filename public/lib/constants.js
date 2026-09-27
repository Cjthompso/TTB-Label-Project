export const WARNING_HEADING = 'GOVERNMENT WARNING:';

export const GOVERNMENT_WARNING =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic ' +
  'beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic ' +
  'beverages impairs your ability to drive a car or operate machinery, and may cause health problems.';

export const WARNING_BODY = GOVERNMENT_WARNING.slice(WARNING_HEADING.length).trim();

export const BEVERAGE_TYPES = ['distilled_spirits', 'wine', 'malt_beverage'];

export const BEVERAGE_LABELS = {
  distilled_spirits: 'Distilled spirits',
  wine: 'Wine',
  malt_beverage: 'Malt beverage (beer)',
  unknown: 'Unknown',
};

export const SPIRITS_STANDARDS_ML = [
  50, 100, 187, 200, 250, 331, 350, 355, 375, 475, 500, 570, 700, 710, 720, 750,
  900, 945, 1000, 1500, 1750, 1800, 2000, 3000, 3750,
];

export const WINE_STANDARDS_ML = [
  50, 100, 180, 187, 200, 250, 300, 330, 355, 360, 365, 375, 475, 500, 550, 568,
  600, 620, 700, 720, 750, 1000, 1500, 1800, 2250, 3000,
];

export const ML_PER_UNIT = {
  ml: 1,
  cl: 10,
  l: 1000,
  'fl oz': 29.5735,
  pint: 473.176,
  quart: 946.353,
  gallon: 3785.41,
};

export const US_UNITS = new Set(['fl oz', 'pint', 'quart', 'gallon']);
