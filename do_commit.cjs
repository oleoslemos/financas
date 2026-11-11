const { execSync } = require('child_process');
try {
  execSync('git add .', { stdio: 'inherit' });
  execSync('git commit -m "feat: redireciona raiz para v2/login, icone branco para hub e azul para orcamento"', { stdio: 'inherit' });
  console.log('COMMIT_SUCCESS');
} catch (err) {
  console.error('COMMIT_ERROR:', err.message);
}
