import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { FennecSiteStack } from '../infra/site-stack';

function productionStack(webAclId?: string) {
  const app = new cdk.App();
  return new FennecSiteStack(app, 'TestSite', {
    env: { account: '309418039962', region: 'us-east-1' },
    domainName: 'app.fennec.gg',
    redirectDomain: 'fennec.gg',
    zoneName: 'fennec.gg',
    hostedZoneId: 'Z0204580IS33A7UZDZ7',
    webAclId,
  });
}

describe('Fennec site infrastructure', () => {
  it('serves the app and apex landing page on one distribution', () => {
    const template = Template.fromStack(productionStack());

    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'app.fennec.gg',
      SubjectAlternativeNames: ['fennec.gg'],
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['app.fennec.gg', 'fennec.gg'],
        PriceClass: Match.absent(),
        DefaultCacheBehavior: Match.objectLike({
          CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
          FunctionAssociations: [
            Match.objectLike({ EventType: 'viewer-request' }),
            Match.objectLike({ EventType: 'viewer-response' }),
          ],
        }),
      }),
    });
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp('statusCode: 308'),
    });
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp(
        "request.uri = '/landing/index.html'",
      ),
    });
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp('assets/[\\s\\S]*landing/'),
    });
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp(
        "'https://app.fennec.gg' \\+ request.uri \\+ querySuffix",
      ),
    });
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp(
        'content-security-policy[\\s\\S]*strict-transport-security',
      ),
    });
    template.resourceCountIs('AWS::CloudFront::CachePolicy', 0);
    template.resourceCountIs('AWS::CloudFront::ResponseHeadersPolicy', 0);
    expect(
      Object.keys(template.findResources('AWS::CloudFront::Function')),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^ApexRouting/),
        expect.stringMatching(/^SecurityHeadersFunction/),
      ]),
    );
    template.resourceCountIs('AWS::Route53::RecordSet', 4);
    template.hasOutput('SiteUrl', { Value: 'https://app.fennec.gg' });
  }, 10_000);

  it('retains privacy-limited access logs and exposes a traffic dashboard', () => {
    const template = Template.fromStack(productionStack());

    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/cloudfront/fennec-access',
      RetentionInDays: 30,
    });
    template.hasResourceProperties('AWS::Logs::DeliverySource', {
      Name: 'fennec-cloudfront-access',
      LogType: 'ACCESS_LOGS',
      ResourceArn: Match.anyValue(),
    });
    template.hasResourceProperties('AWS::Logs::DeliveryDestination', {
      Name: 'fennec-cloudfront-access',
      DeliveryDestinationType: 'CWL',
      OutputFormat: 'json',
    });
    template.hasResourceProperties('AWS::Logs::Delivery', {
      RecordFields: Match.arrayWith([
        'c-ip',
        'cs-uri-stem',
        'cs(Referer)',
        'cs(User-Agent)',
        'x-host-header',
        'sc-content-type',
        'c-country',
      ]),
    });
    const delivery = Object.values(
      template.findResources('AWS::Logs::Delivery'),
    )[0];
    expect(delivery.Properties.RecordFields).not.toEqual(
      expect.arrayContaining(['cs-uri-query', 'cs(Cookie)', 'x-forwarded-for']),
    );
    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: 'FennecTraffic',
    });
    const dashboard = Object.values(
      template.findResources('AWS::CloudWatch::Dashboard'),
    )[0];
    const dashboardFragments = dashboard.Properties.DashboardBody['Fn::Join'][1]
      .filter((fragment: unknown) => typeof fragment === 'string')
      .join('');
    expect(dashboardFragments).toContain('"start":"-P30D"');
    expect(dashboardFragments).toContain('Estimated unique visitors per day');
    expect(dashboardFragments).toContain('count_distinct(visitor)');
    expect(dashboardFragments).toContain(
      'Estimated visitors by country and hostname',
    );
    expect(dashboardFragments).toContain('c-country');
    template.hasOutput('TrafficDashboardName', { Value: Match.anyValue() });
  });

  it('adopts the web ACL created by the flat-rate plan', () => {
    const webAclId =
      'arn:aws:wafv2:us-east-1:309418039962:global/webacl/fennec/example';
    const template = Template.fromStack(productionStack(webAclId));

    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ WebACLId: webAclId }),
    });
  });

  it('rejects a redirect outside the configured zone apex', () => {
    const app = new cdk.App();
    expect(
      () =>
        new FennecSiteStack(app, 'InvalidSite', {
          domainName: 'app.fennec.gg',
          redirectDomain: 'www.fennec.gg',
          zoneName: 'fennec.gg',
          hostedZoneId: 'Z0204580IS33A7UZDZ7',
        }),
    ).toThrow(/zone apex/);
  });
});
