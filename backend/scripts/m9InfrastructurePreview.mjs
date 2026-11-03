#!/usr/bin/env node
/** Generates a CloudFormation *preview file* only. Does not deploy or call AWS. */
import {writeFileSync} from 'node:fs';
import {M9_SCHEMA,validateSchema} from './m9Schema.mjs';
const out=process.argv[2];if(!out||process.argv.length!==3)throw Error('Usage: node scripts/m9InfrastructurePreview.mjs <new-local-path.json>');
const issues=validateSchema();if(issues.length)throw Error(issues.join('\n'));
const resources={};
for(const table of M9_SCHEMA){
 const used=[table.partitionKey,...table.indexes.flatMap(g=>[g.partitionKey,g.sortKey].filter(Boolean))];
 const attrs=[...new Set(used)].map(AttributeName=>({AttributeName,AttributeType:'S'}));
 const keySchema=[{AttributeName:table.partitionKey,KeyType:'HASH'}];
 const indexes=table.indexes.map(g=>({IndexName:g.name,KeySchema:[{AttributeName:g.partitionKey,KeyType:'HASH'},...(g.sortKey?[{AttributeName:g.sortKey,KeyType:'RANGE'}]:[])],Projection:{ProjectionType:'ALL'}}));
 const logicalName=table.tableName.replace(/[^a-z0-9]/gi,'_');
 resources[logicalName]={Type:'AWS::DynamoDB::Table',DeletionPolicy:'Retain',UpdateReplacePolicy:'Retain',Properties:{TableName:table.tableName,BillingMode:'PAY_PER_REQUEST',AttributeDefinitions:attrs,KeySchema:keySchema,...(indexes.length?{GlobalSecondaryIndexes:indexes}:{}),PointInTimeRecoverySpecification:{PointInTimeRecoveryEnabled:true},DeletionProtectionEnabled:true}};
}
const data={AWSTemplateFormatVersion:'2010-09-09',Description:'M9.3 LOCAL PREVIEW ONLY — not approved for deployment',Resources:resources};
writeFileSync(out,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({localPreview:out,tableCount:M9_SCHEMA.length,awsWrites:false},null,2));
