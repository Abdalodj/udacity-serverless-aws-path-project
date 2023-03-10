/* eslint-disable no-template-curly-in-string */
import type { AWS, } from '@serverless/typescript';

// import hello from '@functions/hello';

const serverlessConfiguration: AWS = {
  service: 'udagram-app',
  frameworkVersion: '3',
  plugins: ['serverless-esbuild', 'serverless-aws-documentation'],
  provider: {
    name: 'aws',
    runtime: 'nodejs14.x',
    apiGateway: {
      minimumCompressionSize: 1024,
      shouldStartNameWithService: true,
    },
    environment: {
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      NODE_OPTIONS: '--enable-source-maps --stack-trace-limit=1000',
      GROUPS_TABLE: "Groups-${self:provider.stage}",
      IMAGES_TABLE: "Images-${self:provider.stage}",
      CONNECTIONS_TABLE: "Connections-${self:provider.stage}",
      IMAGE_ID_INDEX: "ImageIdIndex",
      IMAGES_S3_BUCKET: "new-serverless-udagram-images-${self:provider.stage}",
      // @ts-ignore
      SIGNED_URL_EXPIRATION: 300
    },
    stage: "${opt:stage, 'dev'}",
    region: "${opt:region, 'us-east-1'}" as AWS['provider']['region'],
    iam: {
      role: {
        statements: [
          {
            Effect: "Allow",
            Action: ["dynamodb:Scan", "dynamodb:PutItem", "dynamodb:GetItem"],
            Resource: "arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.GROUPS_TABLE}"
          },
          {
            Effect: "Allow",
            Action: ["dynamodb:PutItem", "dynamodb:Query"],
            Resource: "arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.IMAGES_TABLE}"
          },
          {
            Effect: "Allow",
            Action: ["dynamodb:Query"/* , "dynamodb:PutItem" */],
            Resource: "arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.IMAGES_TABLE}/index/${self:provider.environment.IMAGE_ID_INDEX}"
          },
          {
            Effect: "Allow",
            Action: ["s3:PutObject", "s3:GetObject"],
            Resource: "arn:aws:s3:::${self:provider.environment.IMAGES_S3_BUCKET}/*"
          },
          {
            Effect: "Allow",
            Action: ["dynamodb:Scan", "dynamodb:PutItem", "dynamodb:DeleteItem"],
            Resource: "arn:aws:dynamodb:${opt:region, self:provider.region}:*:table/${self:provider.environment.CONNECTIONS_TABLE}"
          },
        ]
      }
    }
  },
  // import the function via paths
  // functions: { hello },
  functions: {
    GetGroups: {
      handler: 'src/lambda/http/getGroups.handler',
      events: [
        {
          http: {
            method: 'GET',
            path: 'groups',
            cors: true
          }
        }
      ]
    },
    CreateGroup: {
      handler: 'src/lambda/http/createGroup.handler',
      events: [
        {
          http: {
            method: 'POST',
            path: 'groups',
            cors: true,
            request: {
              schemas: {
                "application/json": "${file(models/create-group-request.json)}"
              }
            }
          }
        }
      ]
    },
    GetImages: {
      handler: 'src/lambda/http/getImages.handler',
      events: [
        {
          http: {
            method: 'GET',
            path: 'groups/{groupId}/images',
            cors: true
          }
        }
      ]
    },
    GetImage: {
      handler: 'src/lambda/http/getImage.handler',
      events: [
        {
          http: {
            method: 'GET',
            path: 'images/{imageId}',
            cors: true
          }
        }
      ]
    },
    CreateImage: {
      handler: 'src/lambda/http/createImage.handler',
      events: [
        {
          http: {
            method: 'POST',
            path: 'groups/{groupId}/images',
            cors: true,
            request: {
              schemas: {
                "application/json": "${file(models/create-image-request.json)}"
              }
            }
          }
        }
      ]
    },
    SendUploadNotifications: {
      handler: 'src/lambda/s3/sendNotifications.handler'
    },
    ConnectHandler: {
      handler: "src/lambda/websocket/connect.handler",
      events: [
        {
          websocket: {
            route: "$connect"
          }
        }
      ]
    },
    DisconnectHandler: {
      handler: "src/lambda/websocket/disconnect.handler",
      events: [{
        websocket: {
          route: "$disconnect"
        }
      }]
    }



  },
  resources: {
    Resources: {
      RequestBodyValidator: {
        Type: "AWS::ApiGateway::RequestValidator",
        Properties: {
          Name: 'request-body-validator',
          RestApiId: {
            Ref: "ApiGatewayRestApi"
          },
          ValidateRequestBody: true,
          ValidateRequestParameters: false
        }
      },
      GroupDynamoDBTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          AttributeDefinitions: [
            {
              AttributeName: "id",
              AttributeType: "S"
            }
          ],
          KeySchema: [
            {
              AttributeName: "id",
              KeyType: "HASH"
            }
          ],
          BillingMode: 'PAY_PER_REQUEST',
          TableName: "${self:provider.environment.GROUPS_TABLE}"
        }
      },
      ImagesDynamoDBTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          AttributeDefinitions: [
            {
              AttributeName: "groupId",
              AttributeType: "S"
            },
            {
              AttributeName: "timestamp",
              AttributeType: "S"
            },
            {
              AttributeName: "imageId",
              AttributeType: "S"
            }
          ],
          KeySchema: [
            {
              AttributeName: "groupId",
              KeyType: "HASH"
            },
            {
              AttributeName: "timestamp",
              KeyType: "RANGE"
            }
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: "${self:provider.environment.IMAGE_ID_INDEX}",
              KeySchema: [
                {
                  AttributeName: "imageId",
                  KeyType: "HASH"
                }
              ],
              Projection: {
                ProjectionType: "ALL"
              }
            }
          ],
          BillingMode: 'PAY_PER_REQUEST',
          TableName: "${self:provider.environment.IMAGES_TABLE}"
        }
      },
      AttachmentsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "${self:provider.environment.IMAGES_S3_BUCKET}",
          NotificationConfiguration: {
            LambdaConfigurations: [
              {
                Event: "s3:ObjectCreated:*",
                Function: {
                  'Fn::GetAtt': ['SendUploadNotificationsLambdaFunction', 'Arn']
                }
              }
            ]
          },
          CorsConfiguration: {
            CorsRules: [
              {
                AllowedOrigins: ["*"],
                AllowedHeaders: ["*"],
                AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
                MaxAge: 3000
              }
            ]
          }
        }
      },
      SendUploadNotificationsPermission: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          FunctionName: {
            Ref: "SendUploadNotificationsLambdaFunction"
          },
          Principal: "s3.amazonaws.com",
          Action: "lambda:InvokeFunction",
          SourceAccount: {
            Ref: "AWS::AccountId"
          },
          SourceArn: "arn:aws:s3:::${self:provider.environment.IMAGES_S3_BUCKET}"
        }
      },
      BucketPolicy: {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
          PolicyDocument: {
            Id: "MyPolicy",
            Version: "2012-10-17",
            Statement: [{
              Sid: "PublicReadForGetBucketObjects",
              Effect: "Allow",
              Principal: "*",
              Action: "S3:GetObject",
              Resource: "arn:aws:s3:::${self:provider.environment.IMAGES_S3_BUCKET}/*"
            }]
          },
          Bucket: {
            Ref: "AttachmentsBucket"
          }
        }
      }
    }
  },
  package: { individually: true },
  custom: {
    documentation: {
      api: {
        info: {
          version: 'v1.0.0',
          title: 'Udagram API',
          description: 'Serverless application for image sharing'
        }
      },
      models: [
        {
          name: 'GroupRequest',
          contentType: 'application/json',
          schema: '${file(models/create-group-request.json)}'
        },
        {
          name: 'ImageRequest',
          contentType: 'application/json',
          schema: '${file(models/create-image-request.json)}'
        }
      ]
    },
    esbuild: {
      bundle: true,
      minify: false,
      sourcemap: true,
      exclude: ['aws-sdk'],
      target: 'node14',
      define: { 'require.resolve': undefined },
      platform: 'node',
      concurrency: 10,
    },
  },
};

module.exports = serverlessConfiguration;
