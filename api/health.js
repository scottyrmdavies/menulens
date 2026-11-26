import { healthStatus } from '../server/scan.js';

export function GET() {
  return Response.json(healthStatus());
}
