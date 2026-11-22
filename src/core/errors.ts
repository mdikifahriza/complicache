export class CacheSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CacheSchemaError'
  }
}

export class CacheDriverError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CacheDriverError'
  }
}

export class CacheSerializationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CacheSerializationError'
  }
}
