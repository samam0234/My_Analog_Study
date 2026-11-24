import { MongoClient, ObjectId } from 'mongodb';

const client = new MongoClient(process.env['MONGODB_URL'] || 'mongodb://127.0.0.1:27017');
const posts = client.db('analog_study').collection<{ title: string; createdAt: Date; tags: string[] }>('posts');

try {
  await client.connect();
  await posts.createIndex({ createdAt: -1, _id: -1 });
  const { insertedId } = await posts.insertOne({ title: 'MongoDB 실습', createdAt: new Date(), tags: ['study11'] });
  await posts.updateOne({ _id: new ObjectId(insertedId) }, { $set: { title: '수정한 실습 글' } });
  console.log(await posts.findOne({ _id: insertedId }));
  await posts.deleteOne({ _id: insertedId });
} finally {
  await client.close();
}
