import { execSync } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env
dotenv.config();

// Build the project
console.log('Building project...');
execSync('npm run build', { stdio: 'inherit' });

// Copy .well-known folder from public to dist
console.log('Copying .well-known folder...');
const publicWellKnown = path.join(process.cwd(), 'public', '.well-known');
const distWellKnown = path.join(process.cwd(), 'dist', '.well-known');

// Create .well-known directory in dist if it doesn't exist
if (!fs.existsSync(distWellKnown)) {
  fs.mkdirSync(distWellKnown, { recursive: true });
}

// Copy files from public/.well-known to dist/.well-known
fs.readdirSync(publicWellKnown).forEach(file => {
  const sourcePath = path.join(publicWellKnown, file);
  const destPath = path.join(distWellKnown, file);
  fs.copyFileSync(sourcePath, destPath);
});

// Set AWS credentials for commands
const awsEnv = {
  ...process.env,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_REGION: process.env.AWS_REGION
};

// Sync to S3
console.log('Syncing to S3...');
execSync(`aws s3 sync dist/ s3://${process.env.AWS_S3_BUCKET} --delete`, {
  stdio: 'inherit',
  env: awsEnv
});

// Invalidate CloudFront cache
console.log('Invalidating CloudFront cache...');
execSync(`aws cloudfront create-invalidation --distribution-id ${process.env.CLOUDFRONT_DISTRIBUTION_ID} --paths '/*'`, {
  stdio: 'inherit',
  env: awsEnv
});

console.log('Deployment complete!');