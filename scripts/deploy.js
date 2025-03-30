import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

// Build the project
console.log('Building project...');
execSync('npm run build', { stdio: 'inherit' });

// Sync to S3
console.log('Syncing to S3...');
execSync('aws s3 sync dist/ s3://satlas.earth --delete', { stdio: 'inherit' });

// Invalidate CloudFront cache
console.log('Invalidating CloudFront cache...');
execSync(`aws cloudfront create-invalidation --distribution-id ${process.env.CLOUDFRONT_DISTRIBUTION_ID} --paths '/*'`, { stdio: 'inherit' });

console.log('Deployment complete!');