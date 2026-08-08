import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

export interface FennecSiteStackProps extends cdk.StackProps {
  domainName?: string;
  redirectDomain?: string;
  zoneName?: string;
  hostedZoneId?: string;
  webAclId?: string;
}

export class FennecSiteStack extends cdk.Stack {
  /**
   * Provisions the private site origin, CDN, and security policies, enabling
   * custom-domain resources only when the complete Route 53 tuple is present.
   */
  constructor(scope: Construct, id: string, props: FennecSiteStackProps = {}) {
    super(scope, id, props);
    const domainValues = [props.domainName, props.zoneName, props.hostedZoneId];
    if (domainValues.some(Boolean) && !domainValues.every(Boolean)) {
      throw new Error(
        'FENNEC_APP_DOMAIN, FENNEC_ZONE_NAME, and FENNEC_HOSTED_ZONE_ID must be provided together.',
      );
    }
    if (props.redirectDomain && !props.domainName) {
      throw new Error(
        'FENNEC_REDIRECT_DOMAIN requires the complete custom-domain configuration.',
      );
    }
    if (props.redirectDomain && props.redirectDomain !== props.zoneName) {
      throw new Error(
        'FENNEC_REDIRECT_DOMAIN must be the configured Route 53 zone apex.',
      );
    }

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: `fennec-site-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    let certificate: acm.Certificate | undefined;
    let zone: route53.IHostedZone | undefined;
    if (props.domainName && props.zoneName && props.hostedZoneId) {
      zone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.zoneName,
      });
      certificate = new acm.Certificate(this, 'Certificate', {
        domainName: props.domainName,
        subjectAlternativeNames: props.redirectDomain
          ? [props.redirectDomain]
          : undefined,
        validation: acm.CertificateValidation.fromDns(zone),
      });
    }

    const redirectFunction =
      props.domainName && props.redirectDomain
        ? new cloudfront.Function(this, 'ApexRedirect', {
            comment: `Redirect ${props.redirectDomain} to ${props.domainName}`,
            runtime: cloudfront.FunctionRuntime.JS_2_0,
            code: cloudfront.FunctionCode.fromInline(`
function querySuffix(querystring) {
  var parts = [];
  for (var name in querystring) {
    if (!Object.prototype.hasOwnProperty.call(querystring, name)) continue;
    var parameter = querystring[name];
    var values = parameter.multiValue || [parameter];
    for (var index = 0; index < values.length; index += 1) {
      parts.push(name + '=' + values[index].value);
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}

function handler(event) {
  var request = event.request;
  var host = request.headers.host && request.headers.host.value.toLowerCase();
  if (host === ${JSON.stringify(props.redirectDomain)}) {
    return {
      statusCode: 308,
      statusDescription: 'Permanent Redirect',
      headers: {
        location: {
          value: 'https://${props.domainName}' + request.uri + querySuffix(request.querystring),
        },
      },
    };
  }
  return request;
}
`),
          })
        : undefined;

    const securityHeadersFunction = new cloudfront.Function(
      this,
      'SecurityHeadersFunction',
      {
        comment: 'Apply Fennec browser security headers',
        runtime: cloudfront.FunctionRuntime.JS_2_0,
        code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var response = event.response;
  var headers = response.headers;
  headers['content-security-policy'] = {
    value: ${JSON.stringify("default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*")}
  };
  headers['x-content-type-options'] = { value: 'nosniff' };
  headers['x-frame-options'] = { value: 'DENY' };
  headers['referrer-policy'] = { value: 'strict-origin-when-cross-origin' };
  headers['strict-transport-security'] = {
    value: 'max-age=31536000; includeSubDomains; preload'
  };
  headers['x-xss-protection'] = { value: '1; mode=block' };
  return response;
}
`),
      },
    );

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      domainNames: props.domainName
        ? [props.domainName, props.redirectDomain].filter(
            (domain): domain is string => Boolean(domain),
          )
        : undefined,
      certificate,
      webAclId: props.webAclId,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          ...(redirectFunction
            ? [
                {
                  eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                  function: redirectFunction,
                },
              ]
            : []),
          {
            eventType: cloudfront.FunctionEventType.VIEWER_RESPONSE,
            function: securityHeadersFunction,
          },
        ],
      },
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: cdk.Duration.seconds(0),
      })),
    });

    if (zone && props.domainName) {
      const target = route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution),
      );
      new route53.ARecord(this, 'AliasA', {
        zone,
        recordName: props.domainName,
        target,
      });
      new route53.AaaaRecord(this, 'AliasAaaa', {
        zone,
        recordName: props.domainName,
        target,
      });
      if (props.redirectDomain) {
        new route53.ARecord(this, 'RedirectAliasA', {
          zone,
          recordName: props.redirectDomain,
          target,
        });
        new route53.AaaaRecord(this, 'RedirectAliasAaaa', {
          zone,
          recordName: props.redirectDomain,
          target,
        });
      }
    }

    new cdk.CfnOutput(this, 'SiteBucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
    });
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
    });
    new cdk.CfnOutput(this, 'SiteUrl', {
      value: props.domainName
        ? `https://${props.domainName}`
        : `https://${distribution.distributionDomainName}`,
    });
  }
}
