import{javaBasicProfiles}from'./java-basic.mjs'
import{collectionProfiles}from'./collections.mjs'
import{concurrencyProfiles}from'./concurrency.mjs'
import{jvmProfiles}from'./jvm.mjs'
import{mysqlProfiles}from'./mysql.mjs'
import{redisProfiles}from'./redis.mjs'
import{clickhouseProfiles}from'./clickhouse.mjs'
import{kafkaProfiles}from'./kafka.mjs'
import{elasticsearchProfiles}from'./elasticsearch.mjs'
import{architectureProfiles}from'./architecture.mjs'

export const profiles={
  ...javaBasicProfiles,...collectionProfiles,...concurrencyProfiles,...jvmProfiles,...mysqlProfiles,
  ...redisProfiles,...clickhouseProfiles,...kafkaProfiles,...elasticsearchProfiles,...architectureProfiles
}
