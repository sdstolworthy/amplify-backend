import { Construct } from 'constructs';
import { aws_cognito as cognito, SecretValue } from 'aws-cdk-lib';
import {
  AuthResources,
  BackendOutputStorageStrategy,
  BackendOutputWriter,
} from '@aws-amplify/plugin-types';
import packageJson from '#package.json';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { FederatedPrincipal, IRole, Role } from 'aws-cdk-lib/aws-iam';

export type GoogleLogin = {
  provider: 'google';
  webClientId: string;
  webClientSecret: string;
};

export type LoginMechanism = 'email' | 'username' | 'phone' | GoogleLogin;

/**
 * Auth props
 */
export type AmplifyAuthProps = {
  loginMechanisms: LoginMechanism[];
};

/**
 * Amplify Auth CDK Construct
 */
export class AmplifyAuth
  extends Construct
  implements BackendOutputWriter, AuthResources
{
  readonly userPool: UserPool;
  readonly authenticatedUserIamRole: IRole;
  readonly unauthenticatedUserIamRole: IRole;
  /**
   * Create a new Auth construct with AuthProps
   */
  constructor(scope: Construct, id: string, props: AmplifyAuthProps) {
    super(scope, id);

    this.verifyLoginMechanisms(props.loginMechanisms);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      signInCaseSensitive: true,
      signInAliases: {
        username: props.loginMechanisms.includes('username'),
        phone: props.loginMechanisms.includes('phone'),
        email: props.loginMechanisms.includes('email'),
      },
    });

    this.authenticatedUserIamRole = new Role(this, 'authenticatedUserRole', {
      assumedBy: new FederatedPrincipal('cognito-identity.amazonaws.com'),
    });

    this.unauthenticatedUserIamRole = new Role(
      this,
      'unauthenticatedUserRole',
      {
        assumedBy: new FederatedPrincipal('cognito-identity.amazonaws.com'),
      }
    );

    for (const loginMechanism of props.loginMechanisms) {
      if (typeof loginMechanism === 'object') {
        switch (loginMechanism.provider) {
          case 'google':
            new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleIdP', {
              userPool: this.userPool,
              clientSecretValue: SecretValue.unsafePlainText(
                loginMechanism.webClientSecret
              ),
              clientId: loginMechanism.webClientId,
            });
            break;
        }
      }
    }
  }

  /**
   * Stores auth output using the provided strategy
   */
  storeOutput(outputStorageStrategy: BackendOutputStorageStrategy): void {
    outputStorageStrategy.addBackendOutputEntry(packageJson.name, {
      constructVersion: packageJson.version,
      data: {
        userPoolId: this.userPool.userPoolId,
      },
    });
  }

  /**
   * Username cannot be used in conjunction with phone or email
   */
  private verifyLoginMechanisms(loginMechanisms: LoginMechanism[]) {
    if (loginMechanisms.includes('username')) {
      if (
        loginMechanisms.includes('phone') ||
        loginMechanisms.includes('email')
      ) {
        throw new Error(
          'Username login mechanism cannot be used with phone or email login mechanisms'
        );
      }
    }
  }
}