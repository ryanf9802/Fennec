import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import type { Construct } from 'constructs';

export interface FennecCiAccessStackProps extends cdk.StackProps {
  oidcSubject: string;
  existingProviderArn?: string;
}

export class FennecCiAccessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FennecCiAccessStackProps) {
    super(scope, id, props);
    if (
      !props.oidcSubject.startsWith('repo:') ||
      !props.oidcSubject.endsWith(':ref:refs/heads/main') ||
      props.oidcSubject.includes('*')
    ) {
      throw new Error(
        'FENNEC_GITHUB_OIDC_SUBJECT must be an exact GitHub repository subject for refs/heads/main.',
      );
    }
    const provider = props.existingProviderArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          'GitHubProvider',
          props.existingProviderArn,
        )
      : new iam.OpenIdConnectProvider(this, 'GitHubProvider', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
        });
    const principal = new iam.OpenIdConnectPrincipal(provider, {
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': props.oidcSubject,
      },
    });
    const role = new iam.Role(this, 'DeployRole', {
      roleName: 'FennecGitHubDeployRole',
      assumedBy: principal,
      description:
        'Deploys Fennec from the protected main branch through GitHub OIDC.',
      maxSessionDuration: cdk.Duration.hours(1),
    });
    const account = cdk.Aws.ACCOUNT_ID;
    const region = cdk.Aws.REGION;
    const partition = cdk.Aws.PARTITION;
    const updaterSigningParameterName = '/fennec/companion/updater-signing';
    const updaterSigningKey = new kms.Key(this, 'UpdaterSigningKey', {
      alias: 'alias/fennec-companion-updater',
      description:
        'Encrypts the Fennec companion updater signing material in SSM.',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    updaterSigningKey.grantDecrypt(role);
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:${partition}:ssm:${region}:${account}:parameter${updaterSigningParameterName}`,
        ],
      }),
    );
    const bucketArn = `arn:${partition}:s3:::fennec-site-${account}-${region}`;
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:${partition}:iam::${account}:role/cdk-hnb659fds-*-${account}-${region}`,
        ],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: ['*'],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:${partition}:ssm:${region}:${account}:parameter/cdk-bootstrap/hnb659fds/version`,
        ],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetBucketLocation', 's3:ListBucket'],
        resources: [bucketArn],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:DeleteObject', 's3:GetObject', 's3:PutObject'],
        resources: [`${bucketArn}/*`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudfront:CreateInvalidation',
          'cloudfront:GetInvalidation',
        ],
        resources: [`arn:${partition}:cloudfront::${account}:distribution/*`],
      }),
    );
    new cdk.CfnOutput(this, 'DeploymentRoleArn', { value: role.roleArn });
    new cdk.CfnOutput(this, 'UpdaterSigningKeyArn', {
      value: updaterSigningKey.keyArn,
    });
    new cdk.CfnOutput(this, 'UpdaterSigningParameterName', {
      value: updaterSigningParameterName,
    });
  }
}
