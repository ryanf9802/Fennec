import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { FennecCiAccessStack } from '../infra/ci-access-stack';

describe('Fennec CI access infrastructure', () => {
  it('trusts only the immutable Fennec repository identity on main', () => {
    const app = new cdk.App();
    const subject =
      'repo:ryanf9802@59521826/Fennec@1327244735:ref:refs/heads/main';
    const template = Template.fromStack(
      new FennecCiAccessStack(app, 'TestCiAccess', {
        env: { account: '309418039962', region: 'us-east-1' },
        oidcSubject: subject,
      }),
    );

    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'FennecGitHubDeployRole',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [
          Match.objectLike({
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub': subject,
              },
            },
          }),
        ],
      }),
    });
    template.hasResourceProperties('AWS::KMS::Key', {
      Description:
        'Encrypts the Fennec companion updater signing material in SSM.',
      EnableKeyRotation: true,
    });
    template.hasResource('AWS::KMS::Key', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'kms:Decrypt',
          }),
          Match.objectLike({
            Action: 'ssm:GetParameter',
            Resource: {
              'Fn::Join': Match.arrayWith([
                Match.arrayWith([
                  Match.stringLikeRegexp(
                    'parameter/fennec/companion/updater-signing',
                  ),
                ]),
              ]),
            },
          }),
        ]),
      },
    });
  });

  it('rejects wildcard or non-main subjects', () => {
    const app = new cdk.App();
    expect(
      () =>
        new FennecCiAccessStack(app, 'InvalidCiAccess', {
          oidcSubject: 'repo:ryanf9802/*:ref:refs/heads/dev',
        }),
    ).toThrow(/exact GitHub repository subject/);
  });
});
