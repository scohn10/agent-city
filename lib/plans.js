// Client-safe plan definitions. Prices here are for display; Stripe is the source of truth
// for what's charged (looked up by lookup_key).

export const PLANS = {
  free: {
    id: 'free',
    name: 'Village',
    price: 0,
    lots: 2,
    features: { voiceMode: false, files: false },
    blurb: 'Try it out',
  },
  town: {
    id: 'town',
    name: 'Town',
    price: 2.99,
    lots: 8,
    features: { voiceMode: true, files: true },
    lookupKey: 'agentcity_town_monthly',
    blurb: 'For a handful of agents',
  },
  city: {
    id: 'city',
    name: 'City',
    price: 5.99,
    lots: 24,
    features: { voiceMode: true, files: true },
    lookupKey: 'agentcity_city_monthly',
    blurb: 'Every lot in your city',
  },
};

export const PAID_PLANS = ['town', 'city'];
export const PLAN_RANK = { free: 0, town: 1, city: 2 };

export function planInfo(id) {
  return PLANS[id] || PLANS.free;
}

export const FEATURE_COPY = {
  lots: 'build more agents',
  voiceMode: 'use voice mode',
  files: 'attach files',
};
