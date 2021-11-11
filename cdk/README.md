# Example CDK implementation - Amazon ECS on AWS Fargate with Consul Connect service mesh

In this example we'll configure one Consul server in VPC with TLS and gossip encryption enabled. Using AWS CDK, we'll create and deploy the application stack that will launch ECS cluster with sample `greeter` application connected to Consul service mesh.

## Requirements:
* The AWS CLI with valid AWS account credentials configured

## Create the VPC and Consul server

First we're going to create a VPC and Consul server. This stack will automatically configure Consul with TLS and gossip encryption. There will be two AWS Secrets Manager secrets created after successful deployment.

```
aws cloudformation deploy --template-file ./template/consul-server-tls-gossip.yaml --stack-name ConsulServer --region $AWS_REGION
```

## Create the sample CDK application

**work in progress**