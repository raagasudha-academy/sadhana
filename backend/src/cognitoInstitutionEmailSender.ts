import { KmsKeyringNode, buildClient, CommitmentPolicy } from '@aws-crypto/client-node';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { entityTable } from './entityTables.mjs';
import { resolveParentEmailRoute } from './parentEmailRouteResolver.ts';
import { resolveInstitutionSender } from './institutionEmailSenders.ts';
import { parentInvitationTemplate } from './parentInvitationTemplate.ts';

export type EmailEvent = {
  triggerSource: string;
  userPoolId: string;
  userName: string;
  request: {
    type?: string;
    code?: string;
    userAttributes?: Record<string, string | undefined>;
    clientMetadata?: Record<string, string> | null;
  };
};

type Institution = 'raaga' | 'sruti';

type Message = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

type Dependencies = {
  userPoolId: string;
  loginUrl: string;
  resolve: (username: string, email: string) => Promise<Institution>;
  decrypt: (code: string) => Promise<string>;
  send: (message: Message) => Promise<void>;
};

const SUPPORTED = new Set([
  'CustomEmailSender_AdminCreateUser',
  'CustomEmailSender_SignUp',
  'CustomEmailSender_ResendCode',
  'CustomEmailSender_ForgotPassword',
  'CustomEmailSender_UpdateUserAttribute',
  'CustomEmailSender_VerifyUserAttribute',
  'CustomEmailSender_Authentication',
  'CustomEmailSender_AccountTakeOverNotification',
]);

const GENERAL_FROM = 'Sadhana Portal <noreply@sruti.co.uk>';

const escapeHTML = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] || c,
  );

function formatFrom(name: string, email: string) {
  const encoded = /[^\x20-\x7e]/.test(name)
    ? `=?UTF-8?B?${Buffer.from(name).toString('base64')}?=`
    : name;
  return `${encoded} <${email}>`;
}

function makeCodeMessage(type: string, code: string, loginUrl: string) {
  const content: Record<string, [string, string]> = {
    CustomEmailSender_SignUp: [
      'Confirm your Sadhana account',
      'Use this code to confirm your Sadhana account.',
    ],
    CustomEmailSender_ResendCode: [
      'Your new Sadhana confirmation code',
      'Use this replacement confirmation code.',
    ],
    CustomEmailSender_ForgotPassword: [
      'Reset your Sadhana password',
      'Use this code to reset your Sadhana password.',
    ],
    CustomEmailSender_UpdateUserAttribute: [
      'Verify your new email address',
      'Use this code to verify your updated email address.',
    ],
    CustomEmailSender_VerifyUserAttribute: [
      'Verify your Sadhana email address',
      'Use this code to verify your email address.',
    ],
    CustomEmailSender_Authentication: [
      'Your Sadhana sign-in code',
      'Use this one-time code to sign in to Sadhana.',
    ],
  };

  const details = content[type];
  if (!details) throw Error('Unsupported code message');

  const [subject, instruction] = details;
  const safeCode = escapeHTML(code);
  const safeUrl = escapeHTML(loginUrl);

  const html = `
    <div style="font-family:Arial,sans-serif;
                max-width:520px;margin:auto;
                padding:28px;color:#233044">
      <h2>Sadhana Academy & Learning Portal</h2>
      <p>${escapeHTML(instruction)}</p>
      <p style="padding:18px;background:#f1f4f8;
                border-radius:8px;font-size:26px;
                font-weight:bold;letter-spacing:3px">
        ${safeCode}
      </p>
      <p>Enter this code in the Sadhana portal.</p>
      <p><a href="${safeUrl}">Open Sadhana</a></p>
      <p style="font-size:12px;color:#68758a">
        If you did not request this, do not share the code.
      </p>
    </div>`;

  const text =
    `${instruction}\n\n${code}\n\n` +
    `Open Sadhana: ${loginUrl}\n\n` +
    'If you did not request this, do not share the code.';

  return { subject, html, text };
}

export function makeInstitutionEmailSender(deps: Dependencies) {
  return async (event: EmailEvent): Promise<EmailEvent> => {
    if (event.userPoolId !== deps.userPoolId) {
      throw Error('Unexpected Cognito user pool');
    }

    if (!SUPPORTED.has(event.triggerSource)) {
      throw Error('Unsupported Cognito email trigger');
    }

    const email = event.request?.userAttributes?.email;
    if (!email || email !== email.trim() || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
      throw Error('Invalid email recipient');
    }

    if (!event.userName) {
      throw Error('Cognito username missing');
    }

    const type = event.triggerSource;
    let from = GENERAL_FROM;
    let subject: string;
    let html: string;
    let text: string;

    if (type === 'CustomEmailSender_AdminCreateUser') {
      // Parent invitations MUST have a validated route.
      // Other admin-created accounts use neutral branding.
      if (event.userName.startsWith('parent-')) {
        const institution = await deps.resolve(event.userName, email.toLowerCase());
        const sender = resolveInstitutionSender(institution);
        from = formatFrom(sender.name, sender.email);
      }

      if (!event.request.code) {
        throw Error('Encrypted temporary password missing');
      }

      const encryptedPassword = await deps.decrypt(event.request.code);
      if (!encryptedPassword) throw Error('Temporary password unavailable');

      // Cognito HTML-escapes temporary passwords before encryption.
      // Decode once; the invitation template handles output escaping.
      const password = encryptedPassword.replace(
        /&(?:lt|gt|quot|#39|#x27|amp);/g,
        (entity) =>
          ({
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&#x27;': "'",
            '&amp;': '&',
          })[entity] ?? entity,
      );

      const invitation = parentInvitationTemplate(
        event.request.userAttributes?.name || 'there',
        password,
        deps.loginUrl,
        email,
      );

      subject = 'Welcome to Sadhana — set up your account';
      html = invitation.html;
      text = invitation.text;
    } else if (type === 'CustomEmailSender_AccountTakeOverNotification') {
      // No verification code is required for this event.
      subject = 'Security notice for your Sadhana account';
      text =
        'Sadhana detected potentially unusual account activity.\n\n' +
        'If this was not you, review your account security ' +
        'and contact your academy administrator.\n\n' +
        `Open Sadhana: ${deps.loginUrl}`;

      html = `
        <div style="font-family:Arial,sans-serif;
                    max-width:520px;margin:auto;padding:24px">
          <h2>Sadhana account security notice</h2>
          <p>Potentially unusual account activity was detected.</p>
          <p>If this was not you, review your account
             security and contact your academy administrator.</p>
          <p><a href="${escapeHTML(deps.loginUrl)}">
             Open Sadhana</a></p>
        </div>`;
    } else {
      if (!event.request.code) {
        throw Error('Encrypted verification code missing');
      }

      const code = await deps.decrypt(event.request.code);
      if (!code) throw Error('Verification code unavailable');

      ({ subject, html, text } = makeCodeMessage(type, code, deps.loginUrl));
    }

    await deps.send({
      from,
      to: email,
      subject,
      html,
      text,
    });

    return event;
  };
}

export async function handler(event: EmailEvent): Promise<EmailEvent> {
  const region = process.env.AWS_REGION || 'us-east-1';
  const keyArn = process.env.SADHANA_EMAIL_KMS_KEY_ARN;
  const userPoolId = process.env.SADHANA_COGNITO_USER_POOL_ID;
  const loginUrl = process.env.SADHANA_PARENT_LOGIN_URL;

  if (!keyArn || !userPoolId || !loginUrl) {
    throw Error('Email sender environment incomplete');
  }

  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const ses = new SESv2Client({ region });

  const { decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT);

  const keyring = new KmsKeyringNode({
    generatorKeyId: keyArn,
  });

  return makeInstitutionEmailSender({
    userPoolId,
    loginUrl,

    resolve: (username, email) =>
      resolveParentEmailRoute(
        db,
        {
          counters: entityTable('counters'),
          registrations: entityTable('registrations'),
        },
        username,
        email,
      ),

    decrypt: async (encrypted) => {
      const result = await decrypt(keyring, Buffer.from(encrypted, 'base64'));
      return Buffer.from(result.plaintext).toString('utf8');
    },

    send: async (message) => {
      await ses.send(
        new SendEmailCommand({
          FromEmailAddress: message.from,
          Destination: {
            ToAddresses: [message.to],
          },
          Content: {
            Simple: {
              Subject: {
                Data: message.subject,
                Charset: 'UTF-8',
              },
              Body: {
                Html: {
                  Data: message.html,
                  Charset: 'UTF-8',
                },
                Text: {
                  Data: message.text,
                  Charset: 'UTF-8',
                },
              },
            },
          },
          ConfigurationSetName: 'sadhana-email-tracking',
        }),
      );
    },
  })(event);
}
