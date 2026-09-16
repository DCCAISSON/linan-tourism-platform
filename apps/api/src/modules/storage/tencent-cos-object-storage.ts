import COS from "cos-nodejs-sdk-v5"

export type TencentCosStorageConfiguration = {
  readonly bucket: string
  readonly region: string
  readonly secretId: string
  readonly secretKey: string
}

export type PutCosObject = {
  readonly body: Buffer
  readonly contentType: string
  readonly key: string
}

export class CosStorageConfigurationError extends Error {
  readonly name = "CosStorageConfigurationError"

  constructor(readonly variableName: string) {
    super(`Missing or invalid COS environment variable: ${variableName}`)
  }
}

export function parseTencentCosStorageConfiguration(
  environment: NodeJS.ProcessEnv,
): TencentCosStorageConfiguration {
  return {
    bucket: requiredEnvironmentValue(environment, "TENCENT_CLOUD_COS_BUCKET"),
    region: requiredEnvironmentValue(environment, "TENCENT_CLOUD_REGION"),
    secretId: requiredEnvironmentValue(environment, "TENCENT_CLOUD_SECRET_ID"),
    secretKey: requiredEnvironmentValue(environment, "TENCENT_CLOUD_SECRET_KEY"),
  }
}

export class TencentCosObjectStorage {
  readonly #bucket: string
  readonly #client: COS
  readonly #region: string

  constructor(configuration: TencentCosStorageConfiguration) {
    this.#bucket = configuration.bucket
    this.#client = new COS({
      SecretId: configuration.secretId,
      SecretKey: configuration.secretKey,
    })
    this.#region = configuration.region
  }

  async assertBucketAccess(): Promise<void> {
    await this.#client.headBucket({
      Bucket: this.#bucket,
      Region: this.#region,
    })
  }

  async putObject(object: PutCosObject): Promise<void> {
    await this.#client.putObject({
      Body: object.body,
      Bucket: this.#bucket,
      ContentType: object.contentType,
      Key: object.key,
      Region: this.#region,
    })
  }

  async getObject(key: string): Promise<Buffer> {
    const result = await this.#client.getObject({
      Bucket: this.#bucket,
      Key: key,
      Region: this.#region,
    })
    return result.Body
  }

  async deleteObject(key: string): Promise<void> {
    await this.#client.deleteObject({
      Bucket: this.#bucket,
      Key: key,
      Region: this.#region,
    })
  }
}

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, variableName: string): string {
  const value = environment[variableName]?.trim()
  if (value === undefined || value.length === 0) {
    throw new CosStorageConfigurationError(variableName)
  }
  return value
}
