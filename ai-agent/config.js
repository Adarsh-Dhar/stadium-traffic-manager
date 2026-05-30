// ai-agent/config.js
import dotenv from "dotenv";
dotenv.config();

export const API_BASE = process.env.AI_AGENT_API_BASE
  || `http://localhost:${process.env.PORT || 5000}/api/fifa`;

export const DRY_RUN = (process.env.AI_AGENT_DRY_RUN || "false") === "true";
