/** Load `.env.local` then `.env` for operator scripts (Next.js does this for the app). */
import { config } from 'dotenv';

config({ path: ['.env.local', '.env'], quiet: true });
