import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export interface FennecCiAccessStackProps extends cdk.StackProps {
  repository: string;
  existingProviderArn?: string;
}

export class FennecCiAccessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FennecCiAccessStackProps) {
    super(scope, id, props);
    const provider = props.existingProviderArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GitHubProvider', props.existingProviderArn)
      : new iam.OpenIdConnectProvider(this, 'GitHubProvider', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
        });
    const principal = new iam.OpenIdConnectPrincipal(provider, {
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': `repo:${props.repository}:ref:refs/heads/main`,
      },
    });
    const role = new iam.Role(this, 'DeployRole', {
      roleName: 'FennecGitHubDeployRole',
      assumedBy: principal,
      description: 'Deploys Fennec from the protected main branch through GitHub OIDC.',
      maxSessionDuration: cdk.Duration.hours(1),
    });
    const account = cdk.Aws.ACCOUNT_ID;
    const region = cdk.Aws.REGION;
    const partition = cdk.Aws.PARTITION;
    const bucketArn = `arn:${partition}:s3:::fennec-site-${account}-${region}`;
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [`arn:${partition}:iam::${account}:role/cdk-hnb659fds-*-${account}-${region}`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['cloudformation:DescribeStacks'],
      resources: ['*'],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [`arn:${partition}:ssm:${region}:${account}:parameter/cdk-bootstrap/hnb659fds/version`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetBucketLocation', 's3:ListBucket'],
      resources: [bucketArn],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:DeleteObject', 's3:GetObject', 's3:PutObject'],
      resources: [`${bucketArn}/*`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
      resources: [`arn:${partition}:cloudfront::${account}:distribution/*`],
    }));
    new cdk.CfnOutput(this, 'DeploymentRoleArn', { value: role.roleArn });
  }
}
