import { InvalidPointsError } from '../errors/invalid-points.error';

export function validatePoints(value: number): void {
  if (!Number.isInteger(value) || value < 10 || value > 50) {
    throw new InvalidPointsError(value);
  }
}
