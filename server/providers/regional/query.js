import { requiredFiniteQueryNumber } from '../common/query.js';

function validRegionalPoint(params) {
  let latitude = requiredFiniteQueryNumber(params, 'latitude');
  if (!Number.isFinite(latitude)) {
    latitude = requiredFiniteQueryNumber(params, 'lat');
  }
  let longitude = requiredFiniteQueryNumber(params, 'longitude');
  if (!Number.isFinite(longitude)) {
    longitude = requiredFiniteQueryNumber(params, 'lon');
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
    return null;
  return { latitude, longitude };
}

export { validRegionalPoint };
