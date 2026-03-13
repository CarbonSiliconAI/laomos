---
name: LinkedIn Messenger
description: Send messages through LinkedIn to connections, groups, and prospects
homepage: https://www.linkedin.com
metadata:
  category: communication
  version: 1.0.0
  author: OpenClaw
  tags:
    - linkedin
    - messaging
    - social-media
    - automation
---

# LinkedIn Messenger Skill

## Overview

This skill enables you to send messages through LinkedIn programmatically. It supports sending direct messages to connections, group messages, and InMail communications. Perfect for outreach campaigns, networking automation, and bulk messaging workflows.

## Prerequisites

Before using this skill, ensure you have:

- Active LinkedIn account with API access enabled
- LinkedIn Developer credentials (Client ID and Client Secret)
- OAuth 2.0 tokens configured
- Node.js 14+ or Python 3.8+ installed
- Required dependencies installed

## Installation

### Using Node.js

```bash
npm install linkedin-api-client dotenv axios

### Using Python

```bash
pip install linkedin-api python-dotenv requests
```

## Configuration

### Step 1: Set Up Environment Variables

Create a `.env` file in your project root:

```bash
cat > .env << 'EOF'
LINKEDIN_CLIENT_ID=your_client_id_here
LINKEDIN_CLIENT_SECRET=your_client_secret_here
LINKEDIN_ACCESS_TOKEN=your_access_token_here
LINKEDIN_REFRESH_TOKEN=your_refresh_token_here
EOF
```

### Step 2: Authenticate with LinkedIn

```bash
# Using curl to obtain access token
curl -X POST https://www.linkedin.com/oauth/v2/accessToken \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET"
```

## Usage

### Send Direct Message to a Connection

#### Node.js Example

```bash
cat > send_message.js << 'EOF'
const axios = require('axios');
require('dotenv').config();

async function sendLinkedInMessage(recipientId, message) {
  try {
    const response = await axios.post(
      'https://api.linkedin.com/v2/messaging/conversations',
      {
        recipients: [recipientId],
        subject: 'Message from OpenClaw',
        body: message
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );
    
    console.log('Message sent successfully!');
    console.log('Conversation ID:', response.data.id);
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    throw error;
  }
}

// Usage
const recipientId = 'urn:li:person:ABC123XYZ';
const message = 'Hello! I would like to connect with you.';

sendLinkedInMessage(recipientId, message);
EOF

node send_message.js
```

#### Python Example

```bash
cat > send_message.py << 'EOF'
import requests
import os
from dotenv import load_dotenv

load_dotenv()

def send_linkedin_message(recipient_id, message, subject="Message from OpenClaw"):
    """Send a direct message through LinkedIn"""
    
    headers = {
        'Authorization': f"Bearer {os.getenv('LINKEDIN_ACCESS_TOKEN')}",
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
    }
    
    payload = {
        'recipients': [recipient_id],
        'subject': subject,
        'body': message
    }
    
    try:
        response = requests.post(
            'https://api.linkedin.com/v2/messaging/conversations',
            json=payload,
            headers=headers
        )
        response.raise_for_status()
        
        print(f"
