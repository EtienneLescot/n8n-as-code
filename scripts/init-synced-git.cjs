const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const FOLDER_NAME = 'workflows';
const TARGET_DIR = path.join(process.cwd(), FOLDER_NAME);

/**
 * Exécute une commande shell de manière synchrone et silencieuse (sauf erreur)
 */
function runCommand(command, cwd) {
  try {
    execSync(command, { cwd, stdio: 'ignore' }); // 'ignore' pour le silence, 'inherit' pour voir les logs
  } catch (error) {
    console.error(`⚠️  Erreur lors de l'exécution de : ${command}`);
    // On ne throw pas l'erreur pour ne pas casser le npm install global
    return false;
  }
  return true;
}

console.log(`🔧 Vérification du dossier de workflows : ${FOLDER_NAME}...`);

// 1. Création du dossier s'il n'existe pas
if (!fs.existsSync(TARGET_DIR)) {
  try {
    fs.mkdirSync(TARGET_DIR);
    console.log(`   ✅ Dossier créé.`);
  } catch (e) {
    console.error(`   ❌ Impossible de créer le dossier.`);
    process.exit(0); // On quitte proprement sans casser l'install
  }
}

// 2. Vérification si Git est déjà initialisé
const gitDir = path.join(TARGET_DIR, '.git');
if (fs.existsSync(gitDir)) {
  console.log(`   ℹ️  Git est déjà initialisé. Rien à faire.`);
  process.exit(0);
}

// 3. Initialisation et configuration
console.log(`   ⚙️  Initialisation du dépôt Git indépendant...`);

const successInit = runCommand('git init', TARGET_DIR);
const successBranch = runCommand('git checkout -b main', TARGET_DIR);

if (successInit) {
  // Création d'un README pour avoir un premier commit propre
  const readmePath = path.join(TARGET_DIR, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, `# Synced Workflows\n\nCe dossier est géré indépendamment du projet principal.\n`);
  }

  // Premier commit automatique pour sécuriser le repo
  runCommand('git add .', TARGET_DIR);
  runCommand('git commit -m "Initialisation automatique du dépôt workflows"', TARGET_DIR);

  console.log(`   ✅ Succès ! Le dossier est prêt à être utilisé.`);
} else {
  console.log(`   ⚠️  Échec de l'initialisation Git (Git est-il installé ?).`);
}