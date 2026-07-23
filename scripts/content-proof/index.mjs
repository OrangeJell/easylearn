import{javaBasicProofs}from'./java-basic.mjs'
import{collectionProofs}from'./collections.mjs'
import{concurrencyProofs}from'./concurrency.mjs'
import{jvmProofs}from'./jvm.mjs'
import{mysqlProofs}from'./mysql.mjs'
import{redisProofs}from'./redis.mjs'
import{clickhouseProofs}from'./clickhouse.mjs'
import{kafkaProofs}from'./kafka.mjs'
import{elasticsearchProofs}from'./elasticsearch.mjs'
import{architectureProofs}from'./architecture.mjs'

export const proofs={
  ...javaBasicProofs,...collectionProofs,...concurrencyProofs,...jvmProofs,...mysqlProofs,
  ...redisProofs,...clickhouseProofs,...kafkaProofs,...elasticsearchProofs,...architectureProofs
}
