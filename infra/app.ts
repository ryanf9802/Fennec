#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FennecCiAccessStack } from './ci-access-stack';
import { FennecSiteStack } from './site-stack';

const app = new cdk.App();
const account = process.env.AWS_ACCOUNT_ID?.trim();
const region = process.env.AWS_REGION?.trim() || 'us-east-1';
if (account && !/^\d{12}$/.test(account))
  throw new Error('AWS_ACCOUNT_ID must be a 12-digit personal AWS account ID.');
if (process.env.FENNEC_APP_DOMAIN?.trim() && region !== 'us-east-1') {
  throw new Error(
    'FennecSite must deploy in us-east-1 so its ACM certificate can be used by CloudFront.',
  );
}
const env = account ? { account, region } : undefined;

new FennecSiteStack(app, 'FennecSite', {
  env,
  description: 'Fennec static web application delivery infrastructure',
  domainName: process.env.FENNEC_APP_DOMAIN?.trim(),
  zoneName: process.env.FENNEC_ZONE_NAME?.trim(),
  hostedZoneId: process.env.FENNEC_HOSTED_ZONE_ID?.trim(),
});

new FennecCiAccessStack(app, 'FennecCiAccess', {
  env,
  description: 'GitHub OIDC deployment access for Fennec',
  repository:
    process.env.FENNEC_GITHUB_REPOSITORY?.trim() || 'ryanf9802/Fennec',
  existingProviderArn: process.env.GITHUB_OIDC_PROVIDER_ARN?.trim(),
});
