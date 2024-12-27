import {CfnOutput, Duration, RemovalPolicy} from 'aws-cdk-lib';
import {InstanceType, LaunchTemplate, UserData, Vpc} from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import {
  Cluster,
  ContainerDefinition,
  ContainerImage,
  Protocol,
  LogDriver,
  FargateService,
  FargateTaskDefinition, EcsOptimizedImage, AsgCapacityProvider
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationListener,
  ApplicationLoadBalancer,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Dynamodb } from './Dynamodb';
import { resolve } from 'path';
import {AutoScalingGroup} from "aws-cdk-lib/aws-autoscaling";
import {ManagedPolicy, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import { backend_subdomain, domain_name } from '../../../config.json';
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {Certificate, CertificateValidation} from "aws-cdk-lib/aws-certificatemanager";

interface Props {
  dynamodb: Dynamodb;
}

export class ECS extends Construct {
  public readonly vpc: Vpc;

  public readonly cluster: Cluster;

  public readonly task_definition: FargateTaskDefinition;

  public readonly container: ContainerDefinition;

  public readonly service: FargateService;

  public readonly load_balancer: ApplicationLoadBalancer;

  public readonly listener: ApplicationListener;

  public readonly log_group: LogGroup;

  public readonly certificate: Certificate;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    this.log_group = new LogGroup(scope, 'ECSLogGroup', {
      logGroupName: 'ecs-logs-chapter-4',
      retention: RetentionDays.ONE_DAY,
      removalPolicy: RemovalPolicy.DESTROY,
    });


    this.cluster = new Cluster(scope, 'EcsCluster', { vpc: this.vpc });

    const userData = UserData.forLinux();
    userData.addCommands(
        'echo ECS_CLUSTER=' + this.cluster.clusterName + ' >> /etc/ecs/ecs.config'
    );

    const instanceRole = new Role(this, 'EC2InstanceRole', {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2ContainerServiceforEC2Role'), // This policy allows ECS to manage EC2 instances
        ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'), // Allows EC2 instances to use SSM (optional)
      ],
    });

    const launchTemplate = new LaunchTemplate(this, 'MyLaunchTemplate', {
      machineImage: EcsOptimizedImage.amazonLinux2(), // ECS-optimized AMI
      instanceType: new InstanceType('t2.micro'),
      userData: userData,
      role: instanceRole
    });


    const asg = new AutoScalingGroup(this, 'DefaultAutoScalingGroup', {
      vpc: this.vpc,
      launchTemplate: launchTemplate,
      minCapacity: 1,
      maxCapacity: 3,
//      vpc: this.vpc,
//      requireImdsv2: true,
    });

    const asgCapacityProvider = new AsgCapacityProvider(this, 'AsgCapacityProvider', {
      autoScalingGroup: asg,
    });

    this.cluster.addAsgCapacityProvider(asgCapacityProvider);

    this.task_definition = new FargateTaskDefinition(scope, 'TaskDefinition');

    this.container = this.task_definition.addContainer('Express', {
      image: ContainerImage.fromAsset(resolve(__dirname, '..', '..', '..', 'server')),
      memoryLimitMiB: 256,
      logging: LogDriver.awsLogs({
        streamPrefix: 'chapter4',
        logGroup: this.log_group,
      }),
    });

    this.container.addPortMappings({
      containerPort: 80,
      protocol: Protocol.TCP,
    });

    this.service = new FargateService(scope, 'Service', {
      cluster: this.cluster,
      taskDefinition: this.task_definition,
    });

    this.load_balancer = new ApplicationLoadBalancer(scope, 'LB', {
      vpc: this.vpc,
      internetFacing: true,
    });

    this.certificate = new Certificate(scope, 'Certificate', {
      domainName: domain_name,
      validation: CertificateValidation.fromDns(props.route53.hosted_zone),
      subjectAlternativeNames: [`*.${domain_name}`],
    });

    this.listener = this.load_balancer.addListener('PublicListener', {
      port: 443,
      open: true,
      certificates: [props.acm.certificate],
    });

    this.listener.addTargets('ECS', {
      targets: [
        this.service.loadBalancerTarget({
          containerName: 'Express',
          containerPort: 80,
        }),
      ],
      healthCheck: {
        interval: Duration.seconds(60),
        path: '/healthcheck',
        timeout: Duration.seconds(5),
      },
    });

    props.dynamodb.main_table.grantReadWriteData(this.task_definition.taskRole);

    new CfnOutput(scope, 'BackendURL', { value: this.load_balancer.loadBalancerDnsName });
  }
}
