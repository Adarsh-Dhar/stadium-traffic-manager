#!/usr/bin/env node
/**
 * MEMORY MONITORING COMPANION
 * ===========================
 * Run this script in a separate terminal while surge-100k is running
 * to watch your laptop's memory in real-time
 */

import { exec } from "child_process";
import { platform } from "os";
import { promisify } from "util";

const execAsync = promisify(exec);

const OS = platform();

// Colors
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[36m",
  bold: "\x1b[1m",
};

function colorize(text, color, threshold) {
  if (threshold && parseFloat(text) > threshold) {
    return `${colors.red}${text}${colors.reset}`;
  }
  if (color === "warn" && parseFloat(text) > 70) {
    return `${colors.yellow}${text}${colors.reset}`;
  }
  return `${colors.green}${text}${colors.reset}`;
}

function bar(pct, width = 20) {
  const filled = Math.round((Math.min(pct, 100) / 100) * width);
  return `${colors.blue}${"█".repeat(filled)}${colors.reset}${"░".repeat(width - filled)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MACOS SPECIFIC MONITORING
// ═══════════════════════════════════════════════════════════════════════════

async function monitorMacOS() {
  console.log(`${colors.bold}🍎 macOS Memory Monitor${colors.reset}\n`);

  while (true) {
    try {
      // Get system memory
      const { stdout: vmStdout } = await execAsync(
        "vm_stat | head -n 20"
      );

      // Get Node.js process memory
      const { stdout: psStdout } = await execAsync(
        "ps aux | grep 'surge-100k\\|load-test' | grep -v grep"
      );

      // Get total system memory
      const { stdout: memStdout } = await execAsync(
        "sysctl hw.memsize | awk '{print $2}'"
      );

      const totalSystemMemBytes = parseInt(memStdout);
      const totalSystemMemGB = totalSystemMemBytes / 1024 / 1024 / 1024;

      process.stdout.write("\x1b[2J\x1b[H");
      console.log("╔════════════════════════════════════════════════════════════════╗");
      console.log("║          MACOS SYSTEM MEMORY MONITORING                        ║");
      console.log("╚════════════════════════════════════════════════════════════════╝\n");

      // Parse VM stats
      const lines = vmStdout.split("\n");
      let freePages = 0;
      lines.forEach(line => {
        if (line.includes("Pages free")) {
          freePages = parseInt(line.split(":")[1].trim());
        }
      });
      const freeMemGB = (freePages * 4096) / 1024 / 1024 / 1024;
      const usedMemGB = totalSystemMemGB - freeMemGB;
      const usagePercent = (usedMemGB / totalSystemMemGB) * 100;

      console.log(`${colors.bold}System Memory:${colors.reset}`);
      console.log(`  Total    : ${totalSystemMemGB.toFixed(1)} GB`);
      console.log(`  Used     : ${colorize(usedMemGB.toFixed(1), "warn")} GB`);
      console.log(`  Free     : ${freeMemGB.toFixed(1)} GB`);
      console.log(`  Usage    : [${bar(usagePercent)}] ${colorize(usagePercent.toFixed(1), "", 80)}%\n`);

      // Parse Node.js process
      if (psStdout.trim()) {
        const parts = psStdout.split(/\s+/);
        const memPercent = parseFloat(parts[4]);
        const rssBytes = parseInt(parts[5]) * 1024; // ps returns in KB
        const rssMB = rssBytes / 1024 / 1024;

        console.log(`${colors.bold}Node.js Process (surge-100k):${colors.reset}`);
        console.log(`  PID      : ${parts[1]}`);
        console.log(`  Memory % : ${colorize(memPercent.toFixed(1), "", 10)}% of system`);
        console.log(`  RSS      : ${colorize(rssMB.toFixed(0), "", 1500)} MB`);
        console.log(`  CPU %    : ${parts[2]}%`);

        // Check for memory leak pattern
        console.log(`\n${colors.bold}Memory Leak Detector:${colors.reset}`);
        if (rssMB > 1500) {
          console.log(`  🔴 ${colors.red}CRITICAL: Memory usage exceeds 1500MB${colors.reset}`);
          console.log(`     Your system is under EXTREME stress (intended for this test)`);
        } else if (rssMB > 800) {
          console.log(`  🟡 ${colors.yellow}WARNING: Memory usage above 800MB${colors.reset}`);
          console.log(`     Significant memory pressure detected`);
        } else {
          console.log(`  🟢 ${colors.green}Normal memory usage${colors.reset}`);
        }
      } else {
        console.log("⏳ Waiting for surge-100k process to start...");
      }

      console.log(`\n${colors.bold}💡 How to open Activity Monitor:${colors.reset}`);
      console.log("   1. Run: open -a 'Activity Monitor'");
      console.log("   2. Click 'Memory' tab");
      console.log("   3. Click 'node' process");
      console.log("   4. Watch 'Real Memory' column increase");

      console.log(`\n${colors.blue}Refreshing in 1 second... (Ctrl+C to stop)${colors.reset}\n`);

    } catch (err) {
      console.error("Error:", err.message);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LINUX SPECIFIC MONITORING
// ═══════════════════════════════════════════════════════════════════════════

async function monitorLinux() {
  console.log(`${colors.bold}🐧 Linux Memory Monitor${colors.reset}\n`);

  while (true) {
    try {
      // Get system memory
      const { stdout: freeStdout } = await execAsync("free -h | head -n 3");

      // Get Node.js process memory (more detailed)
      const { stdout: psStdout } = await execAsync(
        "ps aux | grep '[s]urge-100k\\|[l]oad-test' || echo 'NOT_RUNNING'"
      );

      // Get process details if running
      let procDetails = "";
      if (!psStdout.includes("NOT_RUNNING") && psStdout.trim()) {
        const pid = psStdout.split(/\s+/)[1];
        try {
          const { stdout: statusStdout } = await execAsync(
            `cat /proc/${pid}/status | grep -E 'VmRSS|VmPeak|VmSize'`
          );
          procDetails = statusStdout;
        } catch {}
      }

      process.stdout.write("\x1b[2J\x1b[H");
      console.log("╔════════════════════════════════════════════════════════════════╗");
      console.log("║          LINUX SYSTEM MEMORY MONITORING                        ║");
      console.log("╚════════════════════════════════════════════════════════════════╝\n");

      console.log(`${colors.bold}System Memory:${colors.reset}`);
      console.log(freeStdout);

      if (!psStdout.includes("NOT_RUNNING") && psStdout.trim()) {
        const parts = psStdout.split(/\s+/);
        const pid = parts[1];
        const rssKB = parseInt(parts[5]);
        const rssMB = rssKB / 1024;

        console.log(`\n${colors.bold}Node.js Process (surge-100k):${colors.reset}`);
        console.log(`  PID      : ${pid}`);
        console.log(`  RSS      : ${colorize(rssMB.toFixed(0), "", 1500)} MB (actual memory)`);
        console.log(`  Memory % : ${parts[3]}% of system`);
        console.log(`  CPU %    : ${parts[2]}%`);

        if (procDetails) {
          console.log(`\n${colors.bold}Detailed Memory Info:${colors.reset}`);
          console.log(procDetails.trim().split("\n").map(l => `  ${l}`).join("\n"));
        }

        // Memory leak detection
        console.log(`\n${colors.bold}Memory Leak Detector:${colors.reset}`);
        if (rssMB > 1500) {
          console.log(`  🔴 ${colors.red}CRITICAL: Memory usage exceeds 1500MB${colors.reset}`);
          console.log(`     Your system is under EXTREME stress (intended for this test)`);
        } else if (rssMB > 800) {
          console.log(`  🟡 ${colors.yellow}WARNING: Memory usage above 800MB${colors.reset}`);
          console.log(`     Significant memory pressure detected`);
        } else {
          console.log(`  🟢 ${colors.green}Normal memory usage${colors.reset}`);
        }
      } else {
        console.log("⏳ Waiting for surge-100k process to start...");
      }

      console.log(`\n${colors.bold}💡 Alternative monitoring methods:${colors.reset}`);
      console.log("   1. htop - Interactive process viewer:");
      console.log("      htop (or: htop -p $(pgrep -f surge-100k))");
      console.log("   2. watch with free command:");
      console.log("      watch -n 1 'free -h && ps aux | grep surge'");
      console.log("   3. dmesg for OOM events:");
      console.log("      watch 'dmesg | tail -20'");

      console.log(`\n${colors.blue}Refreshing in 1 second... (Ctrl+C to stop)${colors.reset}\n`);

    } catch (err) {
      console.error("Error:", err.message);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-PLATFORM MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.clear();

  if (OS === "darwin") {
    await monitorMacOS();
  } else if (OS === "linux") {
    await monitorLinux();
  } else {
    console.error(`❌ Unsupported OS: ${OS}`);
    console.log("Supported: macOS (darwin), Linux");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});