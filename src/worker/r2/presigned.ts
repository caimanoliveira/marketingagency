import { AwsClient } from "aws4fetch";

interface R2Creds {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function endpoint(creds: R2Creds) {
  return `https://${creds.accountId}.r2.cloudflarestorage.com`;
}

function objectUrl(creds: R2Creds, key: string) {
  return `${endpoint(creds)}/${creds.bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
}

function client(creds: R2Creds) {
  return new AwsClient({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    service: "s3",
    region: "auto",
  });
}

export async function presignPut(
  creds: R2Creds,
  key: string,
  mimeType: string,
  expiresInSeconds = 900
): Promise<string> {
  const aws = client(creds);
  const url = new URL(objectUrl(creds, key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await aws.sign(
    new Request(url.toString(), { method: "PUT", headers: { "content-type": mimeType } }),
    { aws: { signQuery: true } }
  );
  return signed.url;
}

export async function presignGet(
  creds: R2Creds,
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const aws = client(creds);
  const url = new URL(objectUrl(creds, key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await aws.sign(
    new Request(url.toString(), { method: "GET" }),
    { aws: { signQuery: true } }
  );
  return signed.url;
}
