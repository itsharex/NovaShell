// ---------------------------------------------------------------------------
// Debug Copilot — Error Pattern Database
// Comprehensive pattern matching for common terminal errors with fix suggestions.
// ---------------------------------------------------------------------------

export interface ErrorPattern {
  id: string;
  name: string;
  regex: RegExp;
  category: "node" | "git" | "python" | "docker" | "rust" | "system" | "network";
  severity: "critical" | "error" | "warning";
  description: string;
  suggestion: string;
  fixCommand?: string;
}

export interface DetectedIssue {
  pattern: ErrorPattern;
  count: number;
  firstSeen: number;
  lastSeen: number;
  sampleMessage: string;
}

// ---------------------------------------------------------------------------
// Category & Severity visual configuration
// ---------------------------------------------------------------------------

export const CATEGORY_CONFIG: Record<string, { color: string; label: string }> = {
  node: { color: "#3fb950", label: "Node.js" },
  git: { color: "#f97583", label: "Git" },
  python: { color: "#3572A5", label: "Python" },
  docker: { color: "#2496ED", label: "Docker" },
  rust: { color: "#dea584", label: "Rust" },
  system: { color: "#d29922", label: "System" },
  network: { color: "#58a6ff", label: "Network" },
};

export const SEVERITY_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  critical: { color: "#ff4444", icon: "🔴", label: "CRITICAL" },
  error: { color: "#ff7b72", icon: "🟠", label: "ERROR" },
  warning: { color: "#d29922", icon: "🟡", label: "WARNING" },
};

// ---------------------------------------------------------------------------
// Pattern database (60+ patterns)
// ---------------------------------------------------------------------------

export const ERROR_PATTERNS: ErrorPattern[] = [
  // =======================================================================
  // Node.js / NPM  (16 patterns)
  // =======================================================================
  {
    id: "node-module-not-found",
    name: "Module Not Found",
    regex: /\bCannot find module ['"]([^'"]+)['"]/i,
    category: "node",
    severity: "error",
    description: "A required Node.js module is missing from node_modules.",
    suggestion: "Install the missing module with npm or yarn.",
    fixCommand: "npm install",
  },
  {
    id: "node-eacces",
    name: "EACCES Permission Denied",
    regex: /\bEACCES\b.*\bpermission denied\b/i,
    category: "node",
    severity: "error",
    description: "npm does not have permission to write to the target directory.",
    suggestion:
      "Avoid running npm with sudo. Fix directory ownership or use a Node version manager like nvm.",
    fixCommand: "sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}",
  },
  {
    id: "node-eaddrinuse",
    name: "EADDRINUSE — Port In Use",
    regex: /\bEADDRINUSE\b.*(?:address already in use|port\s+\d+)/i,
    category: "node",
    severity: "error",
    description: "The port your application is trying to listen on is already occupied.",
    suggestion: "Find the process using the port and kill it, or choose a different port.",
    fixCommand: "npx kill-port 3000",
  },
  {
    id: "node-err-require-esm",
    name: "ERR_REQUIRE_ESM",
    regex: /\bERR_REQUIRE_ESM\b/,
    category: "node",
    severity: "error",
    description: "A CommonJS require() was used to load an ESM-only package.",
    suggestion:
      'Switch to dynamic import() or add "type": "module" to package.json. Alternatively, use an older version of the package that ships CJS.',
  },
  {
    id: "node-enospc",
    name: "ENOSPC — No Space Left",
    regex: /\bENOSPC\b/i,
    category: "node",
    severity: "critical",
    description: "The filesystem has run out of space or inotify watchers are exhausted.",
    suggestion:
      "Free disk space (remove node_modules, caches) or increase the inotify watch limit.",
    fixCommand: "rm -rf node_modules && npm install",
  },
  {
    id: "node-peer-dep-conflict",
    name: "Peer Dependency Conflict",
    regex: /npm\s+(?:ERR!|WARN)\s+.*\bpeer\s+dep(?:endency)?\b/i,
    category: "node",
    severity: "warning",
    description: "Conflicting peer dependency requirements between installed packages.",
    suggestion: "Try installing with --legacy-peer-deps or update the conflicting packages.",
    fixCommand: "npm install --legacy-peer-deps",
  },
  {
    id: "node-heap-oom",
    name: "Heap Out of Memory",
    regex: /\b(?:FATAL ERROR|JavaScript heap out of memory|Allocation failed)\b/i,
    category: "node",
    severity: "critical",
    description: "The Node.js process exceeded its default memory limit.",
    suggestion: "Increase the heap size with the --max-old-space-size flag.",
    fixCommand: "export NODE_OPTIONS='--max-old-space-size=4096'",
  },
  {
    id: "node-deprecated-warning",
    name: "Deprecated Package",
    regex: /npm\s+WARN\s+deprecated\s+(\S+)/i,
    category: "node",
    severity: "warning",
    description: "A dependency has been deprecated and may no longer receive updates.",
    suggestion:
      "Look for an actively maintained replacement package or update to a newer version.",
  },
  {
    id: "node-enoent",
    name: "ENOENT — File Not Found",
    regex: /\bENOENT\b.*\bno such file or directory\b/i,
    category: "node",
    severity: "error",
    description: "A file or directory required by the operation does not exist.",
    suggestion: "Verify the file path is correct and the file exists before running the command.",
  },
  {
    id: "node-eresolve",
    name: "npm ERESOLVE",
    regex: /npm\s+ERR!\s+code\s+ERESOLVE/i,
    category: "node",
    severity: "error",
    description: "npm could not resolve the dependency tree due to conflicting requirements.",
    suggestion: "Run npm install with --force or --legacy-peer-deps to bypass.",
    fixCommand: "npm install --legacy-peer-deps",
  },
  {
    id: "node-syntax-error-token",
    name: "SyntaxError — Unexpected Token",
    regex: /SyntaxError:\s+Unexpected\s+token/i,
    category: "node",
    severity: "error",
    description:
      "The JS parser encountered syntax it cannot understand — often caused by running modern syntax on an old Node version.",
    suggestion:
      "Check your Node.js version (node -v) and update if needed, or adjust your build target.",
  },
  {
    id: "node-ts-paths",
    name: "TypeScript Path Resolution Failure",
    regex: /\bCannot find module ['"]@\//i,
    category: "node",
    severity: "error",
    description: "TypeScript path aliases (e.g. @/) are not resolving correctly at runtime.",
    suggestion:
      "Ensure tsconfig paths are configured and you have a resolver plugin (tsconfig-paths, vite aliases, etc.).",
  },
  {
    id: "node-cors",
    name: "CORS Error",
    regex: /\bCORS\b.*\bblocked\b|blocked by CORS policy/i,
    category: "node",
    severity: "error",
    description:
      "The browser blocked a cross-origin request because the server did not include the required CORS headers.",
    suggestion:
      "Configure CORS headers on the server or use a proxy during development.",
  },
  {
    id: "node-fetch-econnrefused",
    name: "Fetch ECONNREFUSED",
    regex: /\b(?:fetch failed|ECONNREFUSED)\b/i,
    category: "node",
    severity: "error",
    description: "A network request failed because the target server refused the connection.",
    suggestion:
      "Make sure the server is running and the URL/port is correct.",
  },
  {
    id: "node-audit-vuln",
    name: "npm Audit Vulnerabilities",
    regex: /\bfound\s+\d+\s+vulnerabilit(?:y|ies)\b/i,
    category: "node",
    severity: "warning",
    description: "npm detected known security vulnerabilities in your dependencies.",
    suggestion: "Run npm audit fix to automatically patch compatible updates.",
    fixCommand: "npm audit fix",
  },
  {
    id: "node-experimental-warning",
    name: "Node Experimental Feature Warning",
    regex: /ExperimentalWarning:\s+/i,
    category: "node",
    severity: "warning",
    description: "Your code uses an experimental Node.js API that may change without notice.",
    suggestion:
      "The feature may be unstable. Consider using a stable alternative or suppress the warning with --no-warnings.",
  },

  // =======================================================================
  // Git  (13 patterns)
  // =======================================================================
  {
    id: "git-merge-conflict",
    name: "Merge Conflict",
    regex: /\bCONFLICT\b.*\bMerge conflict\b|Automatic merge failed/i,
    category: "git",
    severity: "error",
    description: "Git could not automatically merge changes — manual resolution is required.",
    suggestion:
      "Open the conflicting files, resolve the <<<<< / ===== / >>>>> markers, then stage and commit.",
  },
  {
    id: "git-push-rejected",
    name: "Push Rejected (Non-Fast-Forward)",
    regex: /\b(?:rejected|non-fast-forward)\b.*\bupdates were rejected\b|failed to push some refs/i,
    category: "git",
    severity: "error",
    description: "The remote contains commits you do not have locally.",
    suggestion: "Pull the latest changes first, resolve any conflicts, then push again.",
    fixCommand: "git pull --rebase && git push",
  },
  {
    id: "git-detached-head",
    name: "Detached HEAD",
    regex: /\bdetached HEAD\b|HEAD is now at\b/i,
    category: "git",
    severity: "warning",
    description: "You are not on any branch. Commits made here may be lost.",
    suggestion: "Create or check out a branch to keep your work.",
    fixCommand: "git checkout -b my-branch",
  },
  {
    id: "git-permission-denied-publickey",
    name: "Permission Denied (publickey)",
    regex: /Permission denied \(publickey\)/i,
    category: "git",
    severity: "critical",
    description: "SSH authentication to the remote failed — your key is missing or not loaded.",
    suggestion:
      "Make sure your SSH key is added to the agent (ssh-add) and registered with the remote host.",
    fixCommand: "ssh-add ~/.ssh/id_ed25519",
  },
  {
    id: "git-not-a-repo",
    name: "Not a Git Repository",
    regex: /\bnot a git repository\b/i,
    category: "git",
    severity: "error",
    description: "The current directory is not inside a Git repository.",
    suggestion: "Initialize a new repository or navigate to an existing one.",
    fixCommand: "git init",
  },
  {
    id: "git-branch-exists",
    name: "Branch Already Exists",
    regex: /\bbranch\s+'[^']+'\s+already exists\b|fatal:\s+A branch named/i,
    category: "git",
    severity: "warning",
    description: "You tried to create a branch that already exists.",
    suggestion: "Switch to the existing branch or choose a different name.",
  },
  {
    id: "git-unrelated-histories",
    name: "Unrelated Histories",
    regex: /refusing to merge unrelated histories/i,
    category: "git",
    severity: "error",
    description: "The two branches have no common ancestor commit.",
    suggestion: "If intentional, merge with --allow-unrelated-histories.",
    fixCommand: "git pull origin main --allow-unrelated-histories",
  },
  {
    id: "git-remote-exists",
    name: "Remote Already Exists",
    regex: /fatal:\s+remote\s+\S+\s+already exists/i,
    category: "git",
    severity: "warning",
    description: "The remote name you specified is already configured.",
    suggestion: "Use git remote set-url to update the existing remote URL.",
    fixCommand: "git remote set-url origin <new-url>",
  },
  {
    id: "git-branch-behind",
    name: "Branch Behind Remote",
    regex: /Your branch is behind\b/i,
    category: "git",
    severity: "warning",
    description: "Your local branch is behind the remote — you have un-pulled commits.",
    suggestion: "Pull the latest changes before continuing to work.",
    fixCommand: "git pull",
  },
  {
    id: "git-unstaged-changes",
    name: "Unstaged Changes Blocking Operation",
    regex: /\byour local changes\b.*\bwould be overwritten\b|Please commit your changes or stash them/i,
    category: "git",
    severity: "error",
    description: "Git refuses to proceed because you have uncommitted local changes.",
    suggestion: "Commit or stash your changes before switching branches or pulling.",
    fixCommand: "git stash",
  },
  {
    id: "git-failed-push-refs",
    name: "Failed to Push Refs",
    regex: /error:\s+failed to push some refs to/i,
    category: "git",
    severity: "error",
    description: "Push failed — usually because the remote has diverged.",
    suggestion: "Pull and rebase, then push again.",
    fixCommand: "git pull --rebase && git push",
  },
  {
    id: "git-lock-file",
    name: "Git Lock File Exists",
    regex: /\.git\/index\.lock|Unable to create.*\.lock.*exists/i,
    category: "git",
    severity: "error",
    description:
      "A stale lock file is preventing Git from running. A previous Git process may have crashed.",
    suggestion: "Remove the lock file if no other Git process is running.",
    fixCommand: "rm -f .git/index.lock",
  },
  {
    id: "git-lfs-not-installed",
    name: "Git LFS Not Installed",
    regex: /git:\s+'lfs' is not a git command|This repository is configured for Git LFS/i,
    category: "git",
    severity: "warning",
    description: "The repository requires Git LFS but it is not installed.",
    suggestion: "Install Git LFS and initialize it in the repository.",
    fixCommand: "git lfs install",
  },

  // =======================================================================
  // Python  (11 patterns)
  // =======================================================================
  {
    id: "python-module-not-found",
    name: "ModuleNotFoundError",
    regex: /ModuleNotFoundError:\s+No module named\s+'([^']+)'/,
    category: "python",
    severity: "error",
    description: "Python cannot locate the specified module.",
    suggestion: "Install the package with pip or check that you are in the right virtual environment.",
    fixCommand: "pip install",
  },
  {
    id: "python-syntax-error",
    name: "SyntaxError",
    regex: /SyntaxError:\s+/,
    category: "python",
    severity: "error",
    description: "Python encountered invalid syntax — possibly due to a version mismatch.",
    suggestion:
      "Check your Python version (python --version) and ensure the syntax is compatible.",
  },
  {
    id: "python-indentation",
    name: "IndentationError",
    regex: /IndentationError:\s+/,
    category: "python",
    severity: "error",
    description: "Inconsistent indentation — mixing tabs and spaces or wrong indentation level.",
    suggestion:
      "Configure your editor to use consistent indentation (spaces recommended) and fix the flagged line.",
  },
  {
    id: "python-permission",
    name: "PermissionError",
    regex: /PermissionError:\s+\[Errno\s+13\]/,
    category: "python",
    severity: "error",
    description: "Python does not have permission to access the specified file or directory.",
    suggestion: "Check file permissions or run with appropriate privileges.",
  },
  {
    id: "python-file-not-found",
    name: "FileNotFoundError",
    regex: /FileNotFoundError:\s+\[Errno\s+2\]/,
    category: "python",
    severity: "error",
    description: "The file or directory referenced does not exist.",
    suggestion: "Verify the path is correct and the file exists.",
  },
  {
    id: "python-import-error",
    name: "ImportError",
    regex: /ImportError:\s+cannot import name\s+'([^']+)'/,
    category: "python",
    severity: "error",
    description: "Python found the module but could not import the requested name.",
    suggestion:
      "Check for circular imports, verify the name exists in the module, and ensure the correct package version is installed.",
  },
  {
    id: "python-venv-not-activated",
    name: "Virtual Environment Not Activated",
    regex: /\bNo module named\s+'(venv|virtualenv)'\b|not\s+a\s+virtual\s+environment/i,
    category: "python",
    severity: "warning",
    description: "The Python virtual environment may not be activated.",
    suggestion: "Activate your virtual environment before running the command.",
    fixCommand: "source venv/bin/activate",
  },
  {
    id: "python-pip-outdated",
    name: "pip Version Outdated",
    regex: /WARNING:.*\bpip\b.*\bnewer version\b|You are using pip version/i,
    category: "python",
    severity: "warning",
    description: "Your pip installation is outdated.",
    suggestion: "Upgrade pip to the latest version.",
    fixCommand: "python -m pip install --upgrade pip",
  },
  {
    id: "python-version-mismatch",
    name: "Python Version Mismatch",
    regex: /\bpython.*?requires\s+python\s*[><=!]+\s*[\d.]+/i,
    category: "python",
    severity: "error",
    description: "The package requires a different Python version than the one currently active.",
    suggestion:
      "Install and use the required Python version via pyenv or your system package manager.",
  },
  {
    id: "python-recursion",
    name: "RecursionError",
    regex: /RecursionError:\s+maximum recursion depth exceeded/,
    category: "python",
    severity: "error",
    description: "The call stack exceeded the maximum recursion depth — likely an infinite loop.",
    suggestion:
      "Review the recursive function for a missing or incorrect base case.",
  },
  {
    id: "python-keyboard-interrupt",
    name: "KeyboardInterrupt",
    regex: /KeyboardInterrupt/,
    category: "python",
    severity: "warning",
    description: "The script was interrupted by the user (Ctrl+C).",
    suggestion: "This is usually intentional. If not, check for long-running loops.",
  },

  // =======================================================================
  // Docker  (9 patterns)
  // =======================================================================
  {
    id: "docker-image-not-found",
    name: "Image Not Found",
    regex: /\brepository\s+\S+\s+not found\b|manifest.*not found|pull access denied/i,
    category: "docker",
    severity: "error",
    description: "Docker could not find the specified image in any configured registry.",
    suggestion: "Check the image name and tag. You may need to authenticate or pull from a different registry.",
    fixCommand: "docker pull",
  },
  {
    id: "docker-port-allocated",
    name: "Port Already Allocated",
    regex: /\bport is already allocated\b|Bind for.*failed.*port is already allocated/i,
    category: "docker",
    severity: "error",
    description: "The host port you requested is already in use by another process.",
    suggestion: "Stop the conflicting container or map to a different host port.",
  },
  {
    id: "docker-permission",
    name: "Docker Permission Denied",
    regex: /Got permission denied while trying to connect to the Docker daemon/i,
    category: "docker",
    severity: "error",
    description: "Your user does not have permission to communicate with the Docker daemon.",
    suggestion: "Add your user to the docker group and re-login.",
    fixCommand: "sudo usermod -aG docker $USER",
  },
  {
    id: "docker-no-space",
    name: "Docker No Space Left",
    regex: /no space left on device/i,
    category: "docker",
    severity: "critical",
    description: "Docker has run out of disk space for images, containers, or volumes.",
    suggestion: "Remove unused images, containers, and volumes to reclaim space.",
    fixCommand: "docker system prune -af",
  },
  {
    id: "docker-daemon-not-running",
    name: "Docker Daemon Not Running",
    regex: /Cannot connect to the Docker daemon|Is the docker daemon running/i,
    category: "docker",
    severity: "critical",
    description: "The Docker daemon is not running.",
    suggestion: "Start the Docker service.",
    fixCommand: "sudo systemctl start docker",
  },
  {
    id: "docker-build-context",
    name: "Docker Build Context Too Large",
    regex: /Sending build context to Docker daemon\s+[\d.]+\s*GB/i,
    category: "docker",
    severity: "warning",
    description: "The Docker build context is very large, slowing down builds.",
    suggestion:
      "Add a .dockerignore file to exclude node_modules, .git, and other unnecessary directories.",
  },
  {
    id: "docker-container-in-use",
    name: "Container Name Already In Use",
    regex: /is already in use by container|Conflict\.\s+The container name/i,
    category: "docker",
    severity: "error",
    description: "A container with that name already exists.",
    suggestion: "Remove the existing container or use a different name.",
    fixCommand: "docker rm -f",
  },
  {
    id: "docker-network-not-found",
    name: "Docker Network Not Found",
    regex: /network\s+\S+\s+not found|could not find network/i,
    category: "docker",
    severity: "error",
    description: "The specified Docker network does not exist.",
    suggestion: "Create the network or check for typos.",
    fixCommand: "docker network create",
  },
  {
    id: "docker-compose-version",
    name: "Docker Compose Version Mismatch",
    regex: /version\s+['"]?\d['"]?\s+is\s+(?:obsolete|not supported)|Unsupported config option/i,
    category: "docker",
    severity: "warning",
    description: "The docker-compose.yml format version is incompatible with the installed Compose.",
    suggestion:
      "Update the version field in docker-compose.yml or upgrade Docker Compose.",
  },

  // =======================================================================
  // Rust / Cargo  (9 patterns)
  // =======================================================================
  {
    id: "rust-borrow-moved",
    name: "Borrow of Moved Value",
    regex: /\bborrow of moved value\b/,
    category: "rust",
    severity: "error",
    description: "You tried to use a value after it was moved to another owner.",
    suggestion:
      "Clone the value before moving it, use references, or restructure ownership.",
  },
  {
    id: "rust-lifetime",
    name: "Lifetime Error",
    regex: /\blifetime\b.*\bdoes not live long enough\b|borrowed value does not live long enough/i,
    category: "rust",
    severity: "error",
    description: "A reference outlives the data it borrows from.",
    suggestion:
      "Adjust lifetime annotations or restructure the code so references remain valid.",
  },
  {
    id: "rust-trait-not-impl",
    name: "Trait Not Implemented",
    regex: /the trait\s+`[^`]+`\s+is not implemented for/,
    category: "rust",
    severity: "error",
    description: "A required trait is not implemented for the given type.",
    suggestion:
      "Derive or manually implement the trait, or use a type that already implements it.",
  },
  {
    id: "rust-unresolved-import",
    name: "Unresolved Import",
    regex: /\bunresolved import\b/,
    category: "rust",
    severity: "error",
    description: "Cargo cannot find the specified crate or module.",
    suggestion:
      "Add the dependency to Cargo.toml or verify the module path.",
    fixCommand: "cargo add",
  },
  {
    id: "rust-cannot-find",
    name: "Cannot Find Value / Type",
    regex: /cannot find (?:value|type|function|struct|macro)\s+`[^`]+`/,
    category: "rust",
    severity: "error",
    description: "The compiler cannot find the referenced name in scope.",
    suggestion:
      "Import the item with `use`, check spelling, or verify the feature flag is enabled.",
  },
  {
    id: "rust-mismatched-types",
    name: "Mismatched Types",
    regex: /\bmismatched types\b/,
    category: "rust",
    severity: "error",
    description: "Expected and actual types do not match.",
    suggestion:
      "Convert or cast the value to the expected type, or correct the function signature.",
  },
  {
    id: "rust-unused-variable",
    name: "Unused Variable Warning",
    regex: /warning:\s+unused variable:\s+`([^`]+)`/,
    category: "rust",
    severity: "warning",
    description: "A declared variable is never used.",
    suggestion: "Prefix the variable name with an underscore (_) to silence the warning, or remove it.",
  },
  {
    id: "rust-linker-error",
    name: "Cargo Linker Error",
    regex: /error:\s+linker\s+`[^`]+`\s+not found|linking with\s+`[^`]+`\s+failed/,
    category: "rust",
    severity: "critical",
    description: "The system linker failed — usually due to missing build dependencies.",
    suggestion:
      "Install the required system development libraries (e.g. build-essential, gcc, pkg-config).",
    fixCommand: "sudo apt-get install build-essential pkg-config libssl-dev",
  },
  {
    id: "rust-dead-code",
    name: "Dead Code Warning",
    regex: /warning:.*\bdead_code\b|function\s+is never used/,
    category: "rust",
    severity: "warning",
    description: "Defined code is never called or referenced.",
    suggestion:
      "Remove the unused code or add #[allow(dead_code)] if it is intentionally kept.",
  },

  // =======================================================================
  // System / General  (11 patterns)
  // =======================================================================
  {
    id: "sys-command-not-found",
    name: "Command Not Found",
    regex: /\bcommand not found\b|is not recognized as an internal or external command/i,
    category: "system",
    severity: "error",
    description: "The shell cannot find the specified command.",
    suggestion:
      "Install the tool or add its directory to your PATH.",
  },
  {
    id: "sys-permission-denied",
    name: "Permission Denied",
    regex: /\bpermission denied\b/i,
    category: "system",
    severity: "error",
    description: "The operation was blocked due to insufficient permissions.",
    suggestion:
      "Check the file/directory permissions. Use chmod/chown or run with the appropriate user.",
  },
  {
    id: "sys-no-such-file",
    name: "No Such File or Directory",
    regex: /\bno such file or directory\b/i,
    category: "system",
    severity: "error",
    description: "The target file or directory does not exist.",
    suggestion: "Verify the path is correct. Use ls or find to locate the file.",
  },
  {
    id: "sys-connection-refused",
    name: "Connection Refused",
    regex: /\bconnection refused\b/i,
    category: "system",
    severity: "error",
    description: "The target server actively refused the connection.",
    suggestion: "Make sure the service is running on the expected host and port.",
  },
  {
    id: "sys-dns-resolution",
    name: "DNS Resolution Failed",
    regex: /\bcould not resolve host\b|Temporary failure in name resolution|getaddrinfo\s+ENOTFOUND/i,
    category: "system",
    severity: "error",
    description: "DNS lookup failed — the hostname could not be resolved.",
    suggestion:
      "Check your internet connection and DNS settings. Try using 8.8.8.8 as your DNS server.",
  },
  {
    id: "sys-disk-full",
    name: "Disk Full",
    regex: /\bno space left on device\b|disk quota exceeded/i,
    category: "system",
    severity: "critical",
    description: "The disk is full — no more data can be written.",
    suggestion:
      "Free space by removing temporary files, old logs, or unused Docker images.",
    fixCommand: "df -h && du -sh /tmp/* | sort -rh | head -20",
  },
  {
    id: "sys-oom-killed",
    name: "Out of Memory / Killed",
    regex: /\bOut of memory\b|Killed\s*$|\bOOM\b|Cannot allocate memory/im,
    category: "system",
    severity: "critical",
    description: "The process was killed due to insufficient memory.",
    suggestion:
      "Reduce memory usage, add swap space, or increase available RAM.",
  },
  {
    id: "sys-ssl-certificate",
    name: "SSL Certificate Problem",
    regex: /SSL certificate problem|unable to get local issuer certificate|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE/i,
    category: "system",
    severity: "error",
    description: "An SSL/TLS certificate could not be verified.",
    suggestion:
      "Update your CA certificates, check the system clock, or investigate if a proxy is interfering.",
    fixCommand: "sudo update-ca-certificates",
  },
  {
    id: "sys-connection-timeout",
    name: "Connection Timed Out",
    regex: /\bconnection timed out\b|ETIMEDOUT|ESOCKETTIMEDOUT/i,
    category: "system",
    severity: "error",
    description: "The connection attempt timed out before receiving a response.",
    suggestion:
      "Check your network, firewall rules, and whether the remote host is reachable.",
  },
  {
    id: "sys-too-many-open-files",
    name: "Too Many Open Files",
    regex: /\btoo many open files\b|EMFILE/i,
    category: "system",
    severity: "error",
    description: "The process has exceeded the open file descriptor limit.",
    suggestion: "Increase the file descriptor limit with ulimit.",
    fixCommand: "ulimit -n 65535",
  },
  {
    id: "sys-segfault",
    name: "Segmentation Fault",
    regex: /\bsegmentation fault\b|SIGSEGV/i,
    category: "system",
    severity: "critical",
    description: "A process attempted to access invalid memory and was terminated.",
    suggestion:
      "This usually indicates a bug in native code. Check for buffer overflows or null pointer dereferences.",
  },

  // =======================================================================
  // Network  (8 patterns)
  // =======================================================================
  {
    id: "net-econnreset",
    name: "Connection Reset",
    regex: /\bECONNRESET\b|connection reset by peer/i,
    category: "network",
    severity: "error",
    description: "The remote server forcibly closed the connection.",
    suggestion:
      "Retry the request. If persistent, check server logs or intermediate proxies.",
  },
  {
    id: "net-econnaborted",
    name: "Connection Aborted",
    regex: /\bECONNABORTED\b|software caused connection abort/i,
    category: "network",
    severity: "error",
    description: "The connection was aborted, typically by a network issue.",
    suggestion: "Check network stability and retry the request.",
  },
  {
    id: "net-ehostunreach",
    name: "Host Unreachable",
    regex: /\bEHOSTUNREACH\b|No route to host/i,
    category: "network",
    severity: "error",
    description: "The target host is unreachable from your network.",
    suggestion:
      "Verify the host is online, check firewalls, and ensure correct routing.",
  },
  {
    id: "net-proxy-error",
    name: "Proxy Error",
    regex: /\b(?:proxy|502 Bad Gateway|503 Service Unavailable)\b.*\berror\b/i,
    category: "network",
    severity: "error",
    description: "A proxy or gateway returned an error response.",
    suggestion:
      "Check that the upstream server is running and the proxy configuration is correct.",
  },
  {
    id: "net-rate-limit",
    name: "Rate Limit Exceeded",
    regex: /\brate limit\b|429\s+Too Many Requests|API rate limit exceeded/i,
    category: "network",
    severity: "warning",
    description: "You have sent too many requests in a short period.",
    suggestion:
      "Wait before retrying, implement exponential backoff, or check your API quota.",
  },
  {
    id: "net-unauthorized",
    name: "Unauthorized (401/403)",
    regex: /\b401\s+Unauthorized\b|\b403\s+Forbidden\b|authentication required/i,
    category: "network",
    severity: "error",
    description: "The request was rejected due to missing or invalid credentials.",
    suggestion:
      "Check your API key, token, or login credentials.",
  },
  {
    id: "net-ssl-handshake",
    name: "SSL Handshake Failed",
    regex: /SSL\s+handshake\s+failed|tlsv1 alert|SSL routines.*:wrong version number/i,
    category: "network",
    severity: "error",
    description: "The TLS/SSL handshake could not be completed.",
    suggestion:
      "Verify the server supports modern TLS (1.2+), check for misconfigured proxies, and ensure you are using HTTPS on the correct port.",
  },
  {
    id: "net-socket-hangup",
    name: "Socket Hang Up",
    regex: /\bsocket hang up\b|EPIPE/i,
    category: "network",
    severity: "error",
    description: "The connection was unexpectedly closed by the remote end.",
    suggestion:
      "Retry the request. If it keeps happening, check for request timeouts or server crashes.",
  },
];

// ---------------------------------------------------------------------------
// Severity ordering for sort comparisons
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  error: 1,
  warning: 2,
};

// ---------------------------------------------------------------------------
// Log scanner
// ---------------------------------------------------------------------------

/**
 * Scans an array of log entries against all known error patterns and returns
 * aggregated detected issues, sorted by severity (critical first) then by
 * occurrence count (descending).
 *
 * Only `"error"` and `"warn"` level logs are evaluated for efficiency.
 */
export function scanLogsForIssues(
  logs: Array<{ message: string; timestamp: number; level: string }>,
): DetectedIssue[] {
  const issueMap = new Map<string, DetectedIssue>();

  for (const log of logs) {
    // Only scan error / warn level entries
    const lvl = log.level.toLowerCase();
    if (lvl !== "error" && lvl !== "warn" && lvl !== "warning") {
      continue;
    }

    // First matching pattern wins per log entry (avoid double-counting)
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.regex.test(log.message)) {
        const existing = issueMap.get(pattern.id);

        if (existing) {
          existing.count += 1;
          if (log.timestamp < existing.firstSeen) {
            existing.firstSeen = log.timestamp;
          }
          if (log.timestamp > existing.lastSeen) {
            existing.lastSeen = log.timestamp;
            existing.sampleMessage = log.message;
          }
        } else {
          issueMap.set(pattern.id, {
            pattern,
            count: 1,
            firstSeen: log.timestamp,
            lastSeen: log.timestamp,
            sampleMessage: log.message,
          });
        }

        break; // one match per log entry
      }
    }
  }

  // Sort: severity ascending (critical < error < warning), then count descending
  return Array.from(issueMap.values()).sort((a, b) => {
    const sevDiff =
      (SEVERITY_ORDER[a.pattern.severity] ?? 99) -
      (SEVERITY_ORDER[b.pattern.severity] ?? 99);
    if (sevDiff !== 0) return sevDiff;
    return b.count - a.count;
  });
}

// ---------------------------------------------------------------------------
// Unmatched error collector (for AI analysis layer)
// ---------------------------------------------------------------------------

export interface UnmatchedError {
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  level: string;
  /** Stable key for caching AI responses */
  hash: string;
}

/**
 * Collects error/warn logs that did NOT match any hardcoded pattern.
 * Groups by message similarity (exact match) and returns sorted by count.
 * Limited to top 20 unique errors to avoid sending too much to AI.
 */
export function collectUnmatchedErrors(
  logs: Array<{ message: string; timestamp: number; level: string }>,
): UnmatchedError[] {
  const unmatched = new Map<string, UnmatchedError>();

  for (const log of logs) {
    const lvl = log.level.toLowerCase();
    if (lvl !== "error" && lvl !== "warn" && lvl !== "warning") continue;

    // Check if any pattern matches
    let matched = false;
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.regex.test(log.message)) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Use first 150 chars as grouping key to cluster similar messages
      const key = log.message.slice(0, 150);
      const existing = unmatched.get(key);
      if (existing) {
        existing.count += 1;
        if (log.timestamp < existing.firstSeen) existing.firstSeen = log.timestamp;
        if (log.timestamp > existing.lastSeen) {
          existing.lastSeen = log.timestamp;
          existing.message = log.message;
        }
      } else {
        // Simple hash from message for caching
        let h = 0;
        for (let i = 0; i < key.length; i++) {
          h = ((h << 5) - h + key.charCodeAt(i)) | 0;
        }
        unmatched.set(key, {
          message: log.message,
          count: 1,
          firstSeen: log.timestamp,
          lastSeen: log.timestamp,
          level: lvl,
          hash: `ai-${Math.abs(h).toString(36)}`,
        });
      }
    }
  }

  return Array.from(unmatched.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}
