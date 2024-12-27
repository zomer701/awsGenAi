import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { Dynamodb } from './constructs/Dynamodb';
import { ECS } from './constructs/ECS';
import { S3 } from './constructs/S3';
import {SubnetType, Vpc} from "aws-cdk-lib/aws-ec2";
import {Certificate, CertificateValidation} from "aws-cdk-lib/aws-certificatemanager";
import { backend_subdomain, domain_name } from '../../config.json';
import {HostedZone, IHostedZone} from "aws-cdk-lib/aws-route53";

export class Chapter3Stack extends Stack {
  public readonly dynamodb: Dynamodb;

  public readonly s3: S3;

  public readonly ecs: ECS;

  public readonly vpc: Vpc;

  public readonly certificate: Certificate;

  public readonly hosted_zone: IHostedZone;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.hosted_zone = HostedZone.fromLookup(scope, 'HostedZone', {
      domainName: domain_name,
    });

    this.certificate = new Certificate(scope, 'Certificate', {
      domainName: domain_name,
      validation: CertificateValidation.fromDns(this.hosted_zone),
      subjectAlternativeNames: [`*.${domain_name}`],
    });

    this.vpc = new Vpc(this, 'MyVPC', {
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'ingress',
          subnetType: SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'compute',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 28,
          name: 'rds',
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });



    this.dynamodb = new Dynamodb(this, 'Dynamodb');

    this.s3 = new S3(this, 'S3');

    this.ecs = new ECS(this, 'ECS', {
      dynamodb: this.dynamodb,
    });
  }
}
