import { TEST_DATABASE_URL } from "./env";

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.EMAIL_TRANSPORT = "console";
process.env.APP_URL = "http://localhost:3000";
