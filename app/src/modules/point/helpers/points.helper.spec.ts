import { InvalidPointsError } from '../errors/invalid-points.error';
import { validatePoints } from './points.helper';

describe('validatePoints', () => {
  it.each([10, 25, 50])('accepts %i', (value) => {
    expect(() => validatePoints(value)).not.toThrow();
  });
  it.each([9, 51, 10.5])('rejects %i', (value) => {
    expect(() => validatePoints(value)).toThrow(InvalidPointsError);
  });
});
