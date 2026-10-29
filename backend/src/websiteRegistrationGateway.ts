
/**
 * Server-only Raagasudha v2 intake client.
 * Never import this module in the browser.
 */

import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

export type IntakeListFilters = {
  status?: string;
  locationId?: string;
  from?: string;
  to?: string;
  limit?: string;
};

function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

export function intakePath(
  registrationId?: string,
  personId?: string
): string {
  const valid = (value: string) =>
    /^[A-Za-z0-9_-]{1,120}$/.test(value);

  if (registrationId && !valid(registrationId)) {
    throw httpError('Invalid registration identifier.', 400);
  }

  if (personId && !valid(personId)) {
    throw httpError('Invalid person identifier.', 400);
  }

  if (personId && !registrationId) {
    throw httpError('Registration identifier required.', 400);
  }

  return (
    '/admin/registrations' +
    (registrationId
      ? `/${encodeURIComponent(registrationId)}`
      : '') +
    (personId
      ? `/photos/${encodeURIComponent(personId)}`
      : '')
  );
}

export function intakeQuery(
  filters: IntakeListFilters
): URLSearchParams {
  const params = new URLSearchParams();

  for (const key of [
    'status',
    'locationId',
    'from',
    'to',
    'limit'
  ] as const) {
    const value = filters[key];

    if (value !== undefined && value !== '') {
      if (value.length > 100) {
        throw httpError('Invalid filter.', 400);
      }

      params.set(key, value);
    }
  }

  if (
    filters.limit !== undefined &&
    (
      !/^\d+$/.test(filters.limit) ||
      Number(filters.limit) < 1 ||
      Number(filters.limit) > 100
    )
  ) {
    throw httpError(
      'Limit must be between 1 and 100.',
      400
    );
  }

  return params;
}

export async function fetchWebsiteRegistration(
  registrationId?: string,
  personId?: string,
  filters: IntakeListFilters = {}
): Promise<unknown> {
  const base =
    process.env.RAAGASUDHA_REGISTRATIONS_API_URL;

  if (!base) {
    throw httpError(
      'Website registration integration is not configured.',
      503
    );
  }

  // Allow only the designated Raagasudha API.
  // Never accept an arbitrary URL from the browser.
  const baseUrl = new URL(base);

  if (
    baseUrl.protocol !== 'https:' ||
    baseUrl.hostname !==
    'tc22v9iexa.execute-api.us-east-1.amazonaws.com' ||
    (baseUrl.pathname !== '/' && baseUrl.pathname !== '') ||
    baseUrl.username !== '' ||
    baseUrl.password !== '' ||
    baseUrl.port !== '' ||
    baseUrl.search !== '' ||
    baseUrl.hash !== ''
  ) {
    throw httpError(
      'Website registration API destination is invalid.',
      503
    );
  }

  const url = new URL(
    intakePath(registrationId, personId),
    baseUrl
  );

  if (!registrationId) {
    url.search = intakeQuery(filters).toString();
  }

  /**
   * IMPORTANT:
   * Smithy HttpRequest requires path and query separately.
   *
   * Never use:
   * path: url.pathname + url.search
   *
   * Doing so can produce an invalid SigV4 signature.
   */
  const query: Record<string, string> = {};

  for (const [key, value] of url.searchParams.entries()) {
    query[key] = value;
  }

  const request = new HttpRequest({
    protocol: 'https:',
    hostname: url.hostname,
    method: 'GET',
    path: url.pathname,
    query,
    headers: {
      host: url.host,
      accept: 'application/json'
    }
  });

  // Use the Lambda execution role's AWS credentials.
  const signer = new SignatureV4({
    service: 'execute-api',
    region: 'us-east-1',
    sha256: Sha256,
    credentials: defaultProvider()
  });

  const signed = await signer.sign(request);

  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(signed.headers)) {
    if (value !== undefined) {
      headers[key] = String(value);
    }
  }

  // The HTTP request must match the request that was signed.
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(12000),
    redirect: 'error'
  });

  if (!response.ok) {
    // Log only the status and endpoint type.
    // Never log registration records or presigned URLs.
    console.error('Raagasudha intake request failed', {
      upstreamStatus: response.status,
      endpoint: personId
        ? 'photo'
        : registrationId
          ? 'detail'
          : 'list'
    });

    if (response.status === 404) {
      throw httpError(
        'Website registration not found.',
        404
      );
    }

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      throw httpError(
        'Website registration service access denied.',
        502
      );
    }

    throw httpError(
      'Website registration service unavailable.',
      502
    );
  }

  return await response.json();
}


/** Review only: never creates a Sadhana family, student or enrolment. */
export async function reviewWebsiteRegistration(registrationId:string,reviewStatus:'approved'|'discarded',reviewer:string):Promise<unknown>{
 if(!['approved','discarded'].includes(reviewStatus))throw Object.assign(new Error('Invalid review status.'),{status:400});
 const base=process.env.RAAGASUDHA_REGISTRATIONS_API_URL;
 if(!base)throw Object.assign(new Error('Website registration integration is not configured.'),{status:503});
 const baseUrl=new URL(base);
 if(baseUrl.protocol!=='https:'||baseUrl.hostname!=='tc22v9iexa.execute-api.us-east-1.amazonaws.com'||baseUrl.pathname!=='/'||baseUrl.search||baseUrl.hash)
  throw Object.assign(new Error('Website registration API destination is invalid.'),{status:503});
 const url=new URL(intakePath(registrationId),baseUrl);
 const body=JSON.stringify({reviewStatus,reviewer});
 const bytes=new TextEncoder().encode(body);
 const request=new HttpRequest({protocol:'https:',hostname:url.hostname,method:'PATCH',path:url.pathname,
  headers:{host:url.host,accept:'application/json','content-type':'application/json','content-length':String(bytes.length)},body:bytes});
 const signer=new SignatureV4({service:'execute-api',region:'us-east-1',sha256:Sha256,credentials:defaultProvider()});
 const signed=await signer.sign(request);
 const headers:Record<string,string>={};
 for(const [key,value] of Object.entries(signed.headers))if(value!==undefined)headers[key]=String(value);
 const response=await fetch(url.toString(),{method:'PATCH',headers,body:bytes,signal:AbortSignal.timeout(12000),redirect:'error'});
 if(!response.ok){
  console.error('Raagasudha review failed',{upstreamStatus:response.status});
  if(response.status===401||response.status===403)throw Object.assign(new Error('Website registration review access denied.'),{status:502});
  if(response.status===404)throw Object.assign(new Error('Website registration not found.'),{status:404});
  if(response.status===409)throw Object.assign(new Error('Website registration state changed; refresh and retry.'),{status:409});
  throw Object.assign(new Error('Website registration review failed.'),{status:502});
 }
 return response.status===204?{ok:true}:await response.json();
}

/** Persist a committed Sadhana import mapping in the website intake record. */
export async function updateWebsiteRegistrationImport(registrationId:string,mapping:{status:'imported';familyId:string;studentIds:Record<string,string>}):Promise<void>{
 const base=process.env.RAAGASUDHA_REGISTRATIONS_API_URL;
 if(!base)throw httpError('Website registration integration is not configured.',503);
 const baseUrl=new URL(base);
 if(baseUrl.protocol!=='https:'||baseUrl.hostname!=='tc22v9iexa.execute-api.us-east-1.amazonaws.com'||baseUrl.pathname!=='/'||baseUrl.search||baseUrl.hash)throw httpError('Invalid website API destination.',503);
 const url=new URL(intakePath(registrationId),baseUrl);
 const bytes=new TextEncoder().encode(JSON.stringify({sadhanaImport:mapping}));
 const req=new HttpRequest({protocol:'https:',hostname:url.hostname,method:'PATCH',path:url.pathname,headers:{host:url.host,accept:'application/json','content-type':'application/json','content-length':String(bytes.length)},body:bytes});
 const signed=await new SignatureV4({service:'execute-api',region:'us-east-1',sha256:Sha256,credentials:defaultProvider()}).sign(req);
 const headers:Record<string,string>={};for(const [k,v] of Object.entries(signed.headers))if(v!==undefined)headers[k]=String(v);
 const response=await fetch(url.toString(),{method:'PATCH',headers,body:bytes,signal:AbortSignal.timeout(12000),redirect:'error'});
 if(!response.ok)throw httpError('Website import mapping update failed.',502);
}

/** IAM-signed, CAS-protected website reset. Only called after Sadhana's conditional deletion. */
export async function resetWebsiteRegistrationImport(registrationId:string,evidence:{operationId:string;actor:string;expectedFamilyId:string;expectedStudentIds:Record<string,string>;removedStudentIds:string[];familyDisposition:'deleted'|'retained-shared'}):Promise<void>{
 const base=process.env.RAAGASUDHA_REGISTRATIONS_API_URL;
 if(!base)throw httpError('Website registration integration is not configured.',503);
 const baseUrl=new URL(base);
 if(baseUrl.protocol!=='https:'||baseUrl.hostname!=='tc22v9iexa.execute-api.us-east-1.amazonaws.com'||baseUrl.pathname!=='/'||baseUrl.search||baseUrl.hash)throw httpError('Invalid website API destination.',503);
 const url=new URL(intakePath(registrationId),baseUrl);
 const bytes=new TextEncoder().encode(JSON.stringify({resetSadhanaImport:evidence}));
 const req=new HttpRequest({protocol:'https:',hostname:url.hostname,method:'PATCH',path:url.pathname,headers:{host:url.host,accept:'application/json','content-type':'application/json','content-length':String(bytes.length)},body:bytes});
 const signed=await new SignatureV4({service:'execute-api',region:'us-east-1',sha256:Sha256,credentials:defaultProvider()}).sign(req);
 const headers:Record<string,string>={};for(const [k,v] of Object.entries(signed.headers))if(v!==undefined)headers[k]=String(v);
 const res=await fetch(url.toString(),{method:'PATCH',headers,body:bytes,signal:AbortSignal.timeout(12000),redirect:'error'});
 if(!res.ok)throw httpError(`Website reset failed (HTTP ${res.status})`,res.status===409?409:502);
}
