import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

type GoogleOAuthUser = {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  emailVerified?: boolean;
};

@Injectable()
export class GoogleClientService {
  private getClientId(): string {
    const value = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!value) throw new Error('GOOGLE_CLIENT_ID not configured');
    return value;
  }

  private getClientSecret(): string {
    const value = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!value) throw new Error('GOOGLE_CLIENT_SECRET not configured');
    return value;
  }

  generateAuthLink(callbackUrl: string, state?: string): { url: string; state: string } {
    const clientId = this.getClientId();
    const resolvedState = state || randomBytes(16).toString('hex');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('state', resolvedState);
    return { url: url.toString(), state: resolvedState };
  }

  async handleCallback(code: string, callbackUrl: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    user: GoogleOAuthUser;
  }> {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.getClientId(),
        client_secret: this.getClientSecret(),
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Google token exchange failed: ${text || tokenRes.status}`);
    }

    const token = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    if (!userRes.ok) {
      const text = await userRes.text();
      throw new Error(`Google userinfo failed: ${text || userRes.status}`);
    }
    const userData = (await userRes.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    };

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in,
      user: {
        id: userData.sub,
        email: userData.email,
        name: userData.name,
        avatarUrl: userData.picture,
        emailVerified: userData.email_verified
      }
    };
  }
}

