# Example: Amazon ECS on AWS Fargate with Consul Connect service mesh

In this example we'll configure several Amazon ECS container services running on AWS Fargate to join and communicate via a [Consul Connect service mesh](https://www.consul.io/) with a control plane hosted in Amazon EC2.

For building and deploying this example using AWS CloudFormation, see [here](cfn/)
For building and deploying this example using AWS CDK, see [here](cdk/)

## Architecture
At the end of this demo you should have an architecture which resembles the following:

![AWS resource diagram showing services communicating via Consul](imgs/arch-diagram.PNG)

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.