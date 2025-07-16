// Vercel API Route: api/twitter.js
// This file should be placed in the /api folder of your repository

const crypto = require('crypto');

// OAuth 1.0a signature generation
function generateOAuthSignature(method, url, params, consumerSecret, tokenSecret = '') {
  const paramString = Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  
  const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

export default async function handler(req, res) {
  // Enable CORS for Zendesk domains
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, context } = req.body;
    
    // Twitter OAuth 1.0a credentials (store these securely as environment variables)
    const TWITTER_API_KEY = process.env.TWITTER_API_KEY;
    const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET;
    const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN;
    const TWITTER_ACCESS_TOKEN_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET;
    
    if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_TOKEN_SECRET) {
      return res.status(500).json({ 
        error: 'Twitter OAuth 1.0a credentials not configured',
        required: ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_TOKEN_SECRET']
      });
    }
    
    // OAuth 1.0a parameters
    const oauthParams = {
      oauth_consumer_key: TWITTER_API_KEY,
      oauth_token: TWITTER_ACCESS_TOKEN,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_version: '1.0'
    };
    
    // Generate OAuth signature
    const url = 'https://api.twitter.com/2/tweets';
    oauthParams.oauth_signature = generateOAuthSignature('POST', url, oauthParams, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN_SECRET);
    
    // Create OAuth header
    const oauthHeader = 'OAuth ' + Object.keys(oauthParams)
      .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
      .join(', ');
    
    // Post to Twitter API
    const twitterResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': oauthHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text
      })
    });
    
    const twitterData = await twitterResponse.json();
    
    if (twitterResponse.ok) {
      // Log success for debugging
      console.log('Tweet posted successfully:', {
        tweetId: twitterData.data.id,
        ticketId: context?.ticketId,
        agentName: context?.agentName
      });
      
      return res.status(200).json({
        success: true,
        message: 'Tweet posted successfully',
        tweetId: twitterData.data.id,
        tweetUrl: `https://twitter.com/i/web/status/${twitterData.data.id}`
      });
    } else {
      console.error('Twitter API Error:', twitterData);
      return res.status(400).json({
        error: 'Twitter API Error',
        details: twitterData
      });
    }
    
  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
