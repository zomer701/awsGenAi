import { BlockPublicAccess, Bucket, BucketAccessControl } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { resolve } from 'path';
import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { v4 as uuidv4 } from 'uuid';
import {ARecord, HostedZone, RecordTarget} from "aws-cdk-lib/aws-route53";
import {BucketWebsiteTarget, CloudFrontTarget} from "aws-cdk-lib/aws-route53-targets";
import {Certificate, CertificateValidation} from "aws-cdk-lib/aws-certificatemanager";
import {S3Origin, S3StaticWebsiteOrigin} from "aws-cdk-lib/aws-cloudfront-origins";
import {Distribution, ViewerProtocolPolicy} from "aws-cdk-lib/aws-cloudfront";

export class S3 extends Construct {
  public readonly web_bucket: Bucket;

  public readonly web_bucket_deployment: BucketDeployment;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const hostedZoneId = 'Z07069623Q355Q81LHUKI';
    const domainName = 'social-commerce.app';
    const subdomain = 'front';
    const fullDomainName = `${subdomain}.${domainName}`;

    this.web_bucket = new Bucket(scope, 'WebBucket', {
      bucketName: `${fullDomainName}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ACLS,
      accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Create a CloudFront distribution for the S3 bucket
    const distribution = new Distribution(this, 'MyDistribution', {
      defaultBehavior: {
        origin: new S3StaticWebsiteOrigin(this.web_bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      domainNames: [fullDomainName],
      certificate,
    });

    new ARecord(this, 'AliasRecord', {
      recordName: 'front', // This will create 'gogoday.example.com'
      zone: hostedZone,
      target: RecordTarget.fromAlias(
          new CloudFrontTarget(distribution)
      ),
    });

    this.web_bucket_deployment = new BucketDeployment(scope, 'WebBucketDeployment', {
      sources: [Source.asset(resolve(__dirname, '..', '..', '..', 'web', 'build'))],
      destinationBucket: this.web_bucket,
    });

    new CfnOutput(scope, 'FrontendURL', { value: this.web_bucket.bucketWebsiteUrl });
  }
}
