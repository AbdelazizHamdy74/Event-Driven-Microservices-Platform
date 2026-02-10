const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "friendship-service",
  brokers: [process.env.KAFKA_BROKER],
});

const producer = kafka.producer();

const connectProducer = async () => {
  await producer.connect();
};

module.exports = { producer, connectProducer };
