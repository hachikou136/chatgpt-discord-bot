import supabase from "./supabase.js";
import fs from "fs";
import { VoteClient } from "topgg-votes";

const votesClient = new VoteClient()
  .setToken(process.env.TOPGG_TOKEN)
  .setPort(randomPort());
votesClient.postWebhook();
export async function checkTerms(userId, platform) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId);

  if (error) {
    console.log(error);
    return false;
  }
  if (!data || data.length == 0 || !data[0]) {
    await supabase.from("users").insert([
      {
        id: userId,
        platform: platform,
        acceptterms: true,
        defaultChatModel: "chatgpt",
      },
    ]);
    return `By using this service you accept the following terms of service:\n\nhttps://turingai.tech/botterms\n\nThis message is going to be deleted in 8s in order to continue with your request.`;
  } else {
    let hasVoted = false;
    try {
      hasVoted = await Promise.race([
        votesClient.hasVoted(userId),
        new Promise<boolean>((_, reject) => {
          setTimeout(() => {
            reject(new Error("Timeout"));
          }, 15000);
        }),
      ]);
    } catch (e) {
      hasVoted = false;
    }
    return { model: data[0].defaultChatModel, hasVoted: hasVoted };
  }
}
export async function hasVoted(userId) {
  try {
    let hasVoted = await Promise.race([
      votesClient.hasVoted(userId),
      new Promise<boolean>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Timeout"));
        }, 5000);
      }),
    ]);
    return hasVoted;
  } catch (e) {
    return false;
  }
}

function randomPort() {
  let port = Math.floor(Math.random() * (65535 - 1024) + 1024);
  // check if port is being used
  try {
    fs.accessSync(`http://localhost:${port}`);
    return randomPort();
  } catch (e) {
    return port;
  }
}
