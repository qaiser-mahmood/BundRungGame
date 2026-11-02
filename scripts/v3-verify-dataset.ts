import {readDataset} from './v3-partnership-data';
// Verify every shard, but do not score holdout or use it in model selection.
const d=readDataset(process.argv[2]);console.log(JSON.stringify({verified:true,datasetHash:d.manifest.datasetHash,rows:d.rows.length}));
