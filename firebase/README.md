# Firebase Deployment Guide

This README provides a quick reference for deploying and managing your Firebase application.

## Setup and Configuration

### Initial Setup
```bash
# Install Firebase CLI (if not already installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize a project in the current directory
firebase init
```

## Deployment Commands

### Deploy Everything
```bash
# Deploy all Firebase services
firebase deploy
```

### Deploy Specific Services

```bash
# Deploy only Firebase Functions
firebase deploy --only functions

# Deploy only specific functions
firebase deploy --only functions:processImage,functions:serveImages

# Deploy only Firebase Hosting
firebase deploy --only hosting

# Deploy only Firestore rules and indexes
firebase deploy --only firestore

# Deploy only Storage rules
firebase deploy --only storage
```

## Testing and Development

```bash
# Serve Firebase Hosting locally
firebase serve --only hosting

# Emulate Functions locally
firebase emulators:start --only functions

# Emulate multiple services
firebase emulators:start --only functions,firestore,hosting
```

## Monitoring and Debugging

```bash
# View function logs
firebase functions:log

# View hosting deployments
firebase hosting:sites:list

# Get project details
firebase projects:list
```

## Image Processing System

The application uses Firebase Functions to process images:

1. `processImage` - Triggered when an image is uploaded to the bucket:
   - Creates medium (`_med`) and thumbnail (`_thumb`) versions
   - Medium: 1000x1000px max, 80% quality
   - Thumbnail: 200x200px, 70% quality

2. `serveImages` - HTTP function that serves images through Firebase Hosting:
   - Access via: `https://satlas-world.web.app/images/sits/filename.jpg`
   - Size options: `?size=med` or `?size=thumb`
   - Falls back to original if requested size isn't available

## Common Issues and Solutions

- **Deployment hanging**: Try canceling with Ctrl+C and redeploying with `--debug` flag
- **Function errors**: Check logs with `firebase functions:log`
- **Missing files**: Ensure the `public` directory exists for hosting
- **Permission issues**: Verify your Firebase project permissions

## URL Structure

- Original image: `https://satlas-world.web.app/images/sits/filename.jpg`
- Medium image: `https://satlas-world.web.app/images/sits/filename.jpg?size=med`
- Thumbnail: `https://satlas-world.web.app/images/sits/filename.jpg?size=thumb`

## Storage Structure

- Original images: `sits/filename.jpg`
- Medium versions: `sits/filename_med.jpg`
- Thumbnails: `sits/filename_thumb.jpg`
