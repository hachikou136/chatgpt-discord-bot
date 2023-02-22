import {
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputStyle,
  TextInputBuilder,
} from "discord.js";
import supabase from "../modules/supabase.js";
import { voiceAudio } from "../modules/voice.js";
import ms from "ms";
import { isPremium } from "../modules/premium.js";
import { getUserLang, setUserLang } from "../modules/open-assistant.js";
import OpenAssistant from "open-assistant.js";
var oa: OpenAssistant = new OpenAssistant(
  process.env.OA_APIKEY,
  process.env.OA_APIURL
);

export default {
  data: {
    customId: "open-assistant",
    description: "Open assistant buttons.",
  },
  async execute(
    interaction,
    client,
    action,
    taskId,
    authorId,
    labelTag,
    labelValue
  ) {
    if (!interaction) return;
    var user = {
      id: interaction.user.id,
      display_name: interaction.user.username,
      auth_method: "discord",
    };
    if (action == "info") {
      if (authorId != interaction.user.id) {
        await interaction.reply({
          ephemeral: true,
          content: `${interaction.user}, you can't do this action please use '/open-assistant' to get a task.`,
        });
        return;
      }
      await interaction.deferUpdate();
      var lang = await getUserLang(interaction.user.id);
      if (!lang) {
        await langInteraction(interaction);
      } else {
        var translation = await getTranlation(lang);
        var embed = new EmbedBuilder()
          .setColor("#3a82f7")
          .setTimestamp()
          .setTitle("Open assistant Info")
          .setDescription(
            `Open Assistant is a project organized by LAION and is aimed to be the next ChatGPT but open source making it public of everyone. Now is creating the dataset that you can help to create with this bot. \n\n
          **How it works?**\nClick the button "Grab a task" the first time you click it would ask you to know the language you want to use after that it would show a task you can solve in order to contribute to the dataset. If you don't know what you have to do in that task it would be explained in a short way in the top and you can click the button "what i have to do" to get more information, once you have completed the task you submit it.`
          )
          .setURL("https://open-assistant.io/?ref=turing")
          .setFooter({ text: `${getLocaleDisplayName(lang)}` })
          .setThumbnail("https://open-assistant.io/images/logos/logo.png");
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel(translation.grab_a_task)
            .setCustomId(`open-assistant_tasks_n_${interaction.user.id}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(false),
          new ButtonBuilder()
            .setLabel("Change language")
            .setCustomId(`open-assistant_lang-btn_n_${interaction.user.id}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(false)
        );
        await interaction.editReply({
          embeds: [embed],
          components: [row],
        });
      }
    }
    if (action == "tasks") {
      if (authorId != interaction.user.id) {
        await interaction.reply({
          ephemeral: true,
          content: `${interaction.user}, you can't do this action please use '/open-assistant' to get a task.`,
        });
        return;
      }
      await interaction.deferUpdate();
      var lang = await getUserLang(interaction.user.id);
      if (!lang) {
        await langInteraction(interaction);
      } else {
        var translation = await getTranlation(lang);
        await taskInteraction(interaction, lang, user, translation, client);
      }
    }
    if (action == "lang") {
      if (authorId != interaction.user.id) {
        await interaction.reply({
          ephemeral: true,
          content: `${interaction.user}, you can't do this action please use '/open-assistant' to get a task.`,
        });
        return;
      }
      var selected = interaction.values[0];
      await interaction.deferUpdate();
      await setUserLang(interaction.user.id, selected);
      var translation = await getTranlation(selected);
      var successEmbed = new EmbedBuilder()
        .setColor(`#51F73A`)
        .setTimestamp()
        .setDescription(
          `Language changed to **${getLocaleDisplayName(
            selected
          )} (${selected})**`
        )
        .setURL("https://open-assistant.io/?ref=turing");
      interaction.editReply({
        embeds: [successEmbed],
        components: [],
      });
      setTimeout(async () => {
        await initInteraction(interaction, translation, selected);
      }, 3000);
    }
    if (action == "lang-btn") {
      if (authorId != interaction.user.id) {
        await interaction.reply({
          ephemeral: true,
          content: `${interaction.user}, you can't do this action please use '/open-assistant' to get a task.`,
        });
        return;
      }
      await interaction.deferUpdate();

      await langInteraction(interaction);
    }
    if (action == "skip") {
      if (authorId != interaction.user.id) {
        await interaction.reply({
          ephemeral: true,
          content: `${interaction.user}, you can't do this action please use '/open-assistant' to get a task.`,
        });
        return;
      }
      await interaction.deferUpdate();

      var lang = await getUserLang(interaction.user.id);
      if (!lang) {
        await langInteraction(interaction);
      } else {
        var translation = await getTranlation(lang);
        await oa.rejectTask(taskId, "", user);
        var index = client.tasks.findIndex((x) => x.id == taskId);
        if (index > -1) {
          client.tasks.splice(index, 1);
        }
        await taskInteraction(interaction, lang, user, translation, client);
      }
    }
    if (action == "text-modal") {
      if (authorId != interaction.user.id) {
        await interaction.reply({
          ephemeral: true,
          content: `${interaction.user}, you can't do this action please use '/open-assistant' to get a task.`,
        });
        return;
      }
      var lang = await getUserLang(interaction.user.id);
      if (!lang) {
        await langInteraction(interaction);
      } else {
        var task = client.tasks.find((x) => x.id == taskId);

        if (!task) {
          await interaction.reply({
            ephemeral: true,
            content: `Task not found, please use skip button to get a new task.`,
          });
          return;
        }
        var translation = await getTranlation(lang);
        const promptInput = new TextInputBuilder()
          .setCustomId("modal-input")
          .setMinLength(10)
          .setLabel(translation[formatTaskType(task.type)].label)
          .setPlaceholder(
            translation[formatTaskType(task.type)].response_placeholder
          )
          .setRequired(true)
          // Paragraph means multiple lines of text.
          .setStyle(TextInputStyle.Paragraph);
        const firstActionRow =
          new ActionRowBuilder<TextInputBuilder>().addComponents(promptInput);
        const modal = new ModalBuilder()
          .setCustomId(`open-assistant_modal-submit_${taskId}`)
          .setTitle(
            translation[formatTaskType(task.type)].instruction
              ? translation[formatTaskType(task.type)].instruction
              : translation[formatTaskType(task.type)].label
          );
        modal.addComponents(firstActionRow);
        await interaction.showModal(modal);
      }
    }
    if (action == "modal-submit") {
      await interaction.deferUpdate();
      var lang = await getUserLang(interaction.user.id);
      if (!lang) {
        await langInteraction(interaction);
      } else {
        var task = client.tasks.find((x) => x.id == taskId);

        if (!task) {
          await interaction.reply({
            ephemeral: true,
            content: `Task not found, please use skip button to get a new task.`,
          });
          return;
        }
        var text = interaction.fields.getTextInputValue("modal-input");
        await submitTask(
          taskId,
          user,
          interaction,
          { text },
          lang,
          task,
          client
        );
      }
    }
    if (action == "label") {
      if (authorId != interaction.user.id) {
        await interaction.reply({
          ephemeral: true,
          content: `${interaction.user}, you can't do this action please use '/open-assistant' to get a task.`,
        });
        return;
      }
      var lang = await getUserLang(interaction.user.id);
      if (!lang) {
        await interaction.deferUpdate();

        await langInteraction(interaction);
      } else {
        var translation = await getTranlation(lang);
        var task = client.tasks.find((x) => x.id == taskId);

        if (!task) {
          await interaction.reply({
            ephemeral: true,
            content: `Task not found, please use skip button to get a new task.`,
          });
          return;
        }
        await interaction.deferUpdate();
        var embeds = [];
        var infoEmbed = new EmbedBuilder()
          .setColor("#3a82f7")
          .setTimestamp()
          .setThumbnail("https://open-assistant.io/images/logos/logo.png")
          .setFooter({ text: `${getLocaleDisplayName(lang)}` })
          .setTitle(`${translation[formatTaskType(task.type)].label}`)
          .setDescription(`${translation[formatTaskType(task.type)].overview}`);
        embeds.push(infoEmbed);
        task.conversation.messages.forEach((x, i) => {
          var username = "User";
          if (x.is_assistant) username = "AI";

          var emb = new EmbedBuilder()
            .setAuthor({
              iconURL: `${
                username == "User"
                  ? "https://open-assistant.io/images/temp-avatars/av1.jpg"
                  : "https://open-assistant.io/images/logos/logo.png"
              }`,
              name: username,
            })
            .setDescription(x.text)
            .setFooter({ text: x.frontend_message_id });
          if (i == task.conversation.messages.length - 1) {
            emb.setColor("#3a82f7");
          }
          embeds.push(emb);
        });
        if (labelTag == "submit") {
          var solutions: any = {
            text: "",
            labels: {},
          };
          task.labels.forEach((x) => {
            if (x) {
              solutions.labels[x.name] = parseFloat(x.value);
            }
          });
          console.log(solutions);
          await submitTask(
            taskId,
            user,
            interaction,
            solutions,
            lang,
            task,
            client
          );
          return;
        }
        var label = await getLabel(translation, labelTag, task);
        const row = new ActionRowBuilder();
        const row2 = new ActionRowBuilder();
        var rows = [];
        if (labelTag) {
          labelTag = labelTag.replaceAll("-", "_");
          if (
            !task.labels.find((x) => x.name == labelTag).value &&
            labelValue != "skip"
          ) {
            task.labels.find((x) => x.name == labelTag).value =
              formatLabel(labelValue);
            console.log(formatLabel(labelValue));
          }
        }
        if (!label) {
          var labels = await getLabels(task);
          var readyEmbed = new EmbedBuilder()
            .setColor("#3a82f7")
            .setTimestamp()
            .setFooter({ text: `${getLocaleDisplayName(lang)}` })
            .setTitle(`Are you sure?`)
            .addFields(
              task.labels.map((x) => {
                if (x) {
                  var value = x.value;
                  var label = labels.find((y) => y.name == x.name);
                  if (label.type == "yes/no") {
                    value = value == 1 ? "Yes" : "No";
                  } else {
                    value = `${value * 100}%`;
                  }
                  var name = x.name.replaceAll("_", "");
                  var labelTxt = labelText(label, translation);
                  if (labelTxt.question) {
                    name = labelTxt.question.replaceAll(
                      "{{language}}",
                      getLocaleDisplayName(lang)
                    );
                  }
                  if (labelTxt.max) {
                    name = `${labelTxt.min}/${labelTxt.max}`;
                  }

                  return {
                    name: `${name}`,
                    value: `${value}`,
                    inline: true,
                  };
                }
              })
            );
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(
                `open-assistant_label_${taskId}_${interaction.user.id}_submit`
              )
              .setLabel(`Submit`)
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(
                `open-assistant_label_${taskId}_${interaction.user.id}`
              )
              .setLabel(`Modify one`)
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(
                `open-assistant_skip_${task.id}_${interaction.user.id}`
              )
              .setLabel(`${translation.skip} task`)
              .setStyle(ButtonStyle.Danger)
          );
          await interaction.editReply({
            embeds: [readyEmbed],
            components: [row],
          });
          return;
        }

        if (label.type == "yes/no") {
          var embed = new EmbedBuilder()
            .setColor("#3a82f7")
            .setTimestamp()
            .setFooter({ text: `${getLocaleDisplayName(lang)}` })
            .setTitle(
              `${label.question.replaceAll(
                "{{language}}",
                getLocaleDisplayName(lang)
              )}`
            );
          if (label.description) {
            embed.setDescription(`${label.description}`);
          }
          embeds.push(embed);
          row2.addComponents(
            new ButtonBuilder()
              .setCustomId(
                `open-assistant_label_${taskId}_${
                  interaction.user.id
                }_${label.name.replaceAll("_", "-")}_yes`
              )
              .setLabel(`✔`)
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(
                `open-assistant_label_${taskId}_${
                  interaction.user.id
                }_${label.name.replaceAll("_", "-")}_no`
              )
              .setLabel(`❌`)
              .setStyle(ButtonStyle.Secondary)
          );
        } else {
          var embed = new EmbedBuilder()
            .setColor("#3a82f7")
            .setTimestamp()
            .setFooter({ text: `${getLocaleDisplayName(lang)}` })
            .setTitle(`${label.min}/${label.max}`);
          if (label.description) {
            embed.setDescription(`${label.description}`);
          }
          embeds.push(embed);
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(
                `open-assistant_label_${taskId}_${
                  interaction.user.id
                }_${label.name.replaceAll("_", "-")}_1`
              )
              .setLabel(`1(${label.min})`)
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(
                `open-assistant_label_${taskId}_${
                  interaction.user.id
                }_${label.name.replaceAll("_", "-")}_2`
              )
              .setLabel(`2`)
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(
                `open-assistant_label_${taskId}_${
                  interaction.user.id
                }_${label.name.replaceAll("_", "-")}_3`
              )
              .setLabel(`3`)
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(
                `open-assistant_label_${taskId}_${
                  interaction.user.id
                }_${label.name.replaceAll("_", "-")}_4`
              )
              .setLabel(`4`)
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(
                `open-assistant_label_${taskId}_${
                  interaction.user.id
                }_${label.name.replaceAll("_", "-")}_5`
              )
              .setLabel(`5(${label.max})`)
              .setStyle(ButtonStyle.Secondary)
          );
          rows.push(row);
        }
        if (labelTag || task.labels.find((x) => x.name == "spam").value) {
          row2.addComponents(
            new ButtonBuilder()
              .setCustomId(
                `open-assistant_label_${task.id}_${
                  interaction.user.id
                }_${label.name.replaceAll("_", "-")}_skip`
              )
              .setLabel(`${translation.skip} label`)
              .setStyle(ButtonStyle.Danger)
          );
        }
        row2.addComponents(
          new ButtonBuilder()
            .setCustomId(
              `open-assistant_skip_${task.id}_${interaction.user.id}`
            )
            .setLabel(`${translation.skip} task`)
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setLabel("Change language")
            .setCustomId(`open-assistant_lang-btn_n_${interaction.user.id}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(false)
        );

        rows.push(row2);
        await interaction.editReply({
          embeds: embeds,
          components: rows,
        });
      }
    }
  },
};

async function submitTask(
  taskId,
  user,
  interaction,
  solution,
  lang,
  task,
  client
) {
  var messageId = await oa.acceptTask(taskId, user);
  var solveTask = await oa.solveTask(task, user, lang, solution, messageId);
  await saveTask(task, lang, user, { messageId: messageId, ...solution });
  var index = client.tasks.findIndex((x) => x.id == taskId);
  if (index > -1) {
    client.tasks.splice(index, 1);
  }
  var successEmbed = new EmbedBuilder()
    .setColor(
      `${
        solveTask.type == "task_done"
          ? "#51F73A"
          : solveTask == true
          ? "#51F73A"
          : "#F73A3A"
      }`
    )
    .setTimestamp()
    .setDescription(
      `${
        solveTask.type == "task_done"
          ? "Task done"
          : solveTask == true
          ? "Task done"
          : "Task failed"
      }(loading new task...)`
    )
    .setURL("https://open-assistant.io/?ref=turing")
    .setFooter({ text: `${getLocaleDisplayName(lang)}` });
  await interaction.editReply({
    embeds: [successEmbed],
    components: [],
  });
  setTimeout(async () => {
    var translation = await getTranlation(lang);
    await taskInteraction(interaction, lang, user, translation, client);
  }, 3000);
}

async function getLabel(translation, previousTask: string, task) {
  var labels = await getLabels(task);
  if (previousTask) {
    var previousTaskIndex = labels.findIndex(
      (x) => x.name == previousTask.replaceAll("-", "_")
    );
  } else {
    var previousTaskIndex = -1;
  }

  var label = labels[previousTaskIndex + 1];
  if (!label) return;
  var resultTask: {
    name: string;
    type: string;
    question?: string;
    description?: string;
    max?: string;
    min?: string;
  } = {
    name: label.name,
    type: label.type,
    ...labelText(label, translation),
  };

  return resultTask;
}

function labelText(label, translation) {
  var resultTask: {
    question?: string;
    description?: string;
    max?: string;
    min?: string;
  } = {};
  if (label.name == "spam") {
    resultTask.question = translation["spam.question"];
    resultTask.description = `${translation["spam.one_desc.line_1"]}\n${translation["spam.one_desc.line_2"]}`;
  } else if (label.name == "fails_task") {
    resultTask.question = translation["fails_task.question"];
    resultTask.description = `${translation["fails_task.one_desc"]}`;
  } else if (label.name == "lang_mismatch") {
    resultTask.question = `${translation["lang_mismatch"]}`;
  } else if (label.name == "not_appropriate") {
    resultTask.question = `${translation["inappropriate.one_desc"]}`;
  } else if (label.name == "pii") {
    resultTask.question = `${translation["pii"]}`;
    resultTask.description = `${translation["pii.explanation"]}`;
  } else if (label.name == "hate_speech") {
    resultTask.question = `${translation["hate_speech"]}`;
    resultTask.description = `${translation["hate_speech.explanation"]}`;
  } else if (label.name == "sexual_content") {
    resultTask.question = `${translation["sexual_content"]}`;
    resultTask.description = `${translation["sexual_content.explanation"]}`;
  } else if (label.name == "quality") {
    resultTask.max = `${translation["high_quality"]}`;
    resultTask.min = `${translation["low_quality"]}`;
  } else if (label.name == "helpfulness") {
    resultTask.max = `${translation["helpful"]}`;
    resultTask.min = `${translation["unhelpful"]}`;
  } else if (label.name == "creativity") {
    resultTask.max = `${translation["creative"]}`;
    resultTask.min = `${translation["ordinary"]}`;
  } else if (label.name == "humor") {
    resultTask.max = `${translation["humorous"]}`;
    resultTask.min = `${translation["serious"]}`;
  } else if (label.name == "toxicity") {
    resultTask.max = `${translation["polite"]}`;
    resultTask.min = `${translation["rude"]}`;
  } else if (label.name == "violence") {
    resultTask.max = `${translation["harmless"]}`;
    resultTask.min = `${translation["violent"]}`;
  }
  return resultTask;
}

async function getLabels(task) {
  var labels = [];
  for (var i = 0; i < task.valid_labels.length; i++) {
    var type = "yes/no";
    if (
      task.valid_labels[i] == "quality" ||
      task.valid_labels[i] == "toxicity" ||
      task.valid_labels[i] == "humor" ||
      task.valid_labels[i] == "helpfulness" ||
      task.valid_labels[i] == "creativity" ||
      task.valid_labels[i] == "violence"
    ) {
      type = "number";
    }
    labels.push({
      name: task.valid_labels[i],
      type: type,
    });
  }
  return labels;
}

function formatLabel(label: string) {
  if (label == "yes") {
    return 1;
  } else if (label == "no") {
    return 0;
  } else if (label == "skip") {
    return 0;
  } else if (label == "1") {
    return 0.0;
  } else if (label == "2") {
    return 0.25;
  } else if (label == "3") {
    return 0.5;
  } else if (label == "4") {
    return 0.75;
  } else if (label == "5") {
    return 1.0;
  } else {
    return parseInt(label);
  }
}

export async function getTranlation(lang: string) {
  var res = await fetch(
    `https://open-assistant.io/locales/${lang}/common.json`
  );
  var json = await res.json();
  var res2 = await fetch(
    `https://open-assistant.io/locales/${lang}/tasks.json`
  );
  var json2 = await res2.json();
  var res3 = await fetch(
    `https://open-assistant.io/locales/${lang}/dashboard.json`
  );
  var json3 = await res3.json();
  var res4 = await fetch(
    `https://open-assistant.io/locales/${lang}/leaderboard.json`
  );
  var json4 = await res4.json();
  var res5 = await fetch(
    `https://open-assistant.io/locales/${lang}/labelling.json`
  );
  var json5 = await res5.json();
  var res6 = await fetch(
    `https://open-assistant.io/locales/${lang}/message.json`
  );
  var json6 = await res6.json();
  var translationObject = {
    ...json,
    ...json2,
    ...json3,
    ...json4,
    ...json5,
    ...json6,
  };
  if (!translationObject["skip"]) {
    var englishTranslation = await getTranlation("en");
    translationObject["skip"] = englishTranslation["skip"];
  }
  return translationObject;
}

async function saveTask(task, lang, user, answer) {
  var taskData = {
    ...task,
    lang: lang,
    ...answer,
  };
  var { data, error } = await supabase
    .from("open_assistant_tasks")
    .insert([{ id: task.id, completedBy: user.id, task: taskData }]);
  return true;
}

async function taskInteraction(interaction, lang, user, translation, client) {
  /*var ispremium = await isPremium(interaction.user.id, interaction.guildId);
  if (!ispremium) {
    await interaction.editReply({
      ephemeral: true,
      content: `This feature is only for premium users.`,
    });
    return;
  }*/

  var task = await oa.getTask({
    type: "random",
    user: user,
    collective: false,
    lang: lang,
  });
  client.tasks.push(task);
  if (task.message) {
    var embd = await sendErr(task.message);
    await interaction.editReply({
      embeds: [embd],
      components: [],
    });
    return;
  }
  var embeds = [];
  var embed = new EmbedBuilder()
    .setColor("#3a82f7")
    .setTimestamp()
    .setThumbnail("https://open-assistant.io/images/logos/logo.png")
    .setFooter({ text: `${getLocaleDisplayName(lang)}` })
    .setTitle(`${translation[formatTaskType(task.type)].label}`)
    .setDescription(`${translation[formatTaskType(task.type)].overview}`);
  var rows = [];
  const row = new ActionRowBuilder();

  if (
    task.type == "initial_prompt" ||
    task.type == "assistant_reply" ||
    task.type == "prompter_reply"
  ) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(
          `open-assistant_text-modal_${task.id}_${interaction.user.id}`
        )
        .setLabel(`${translation[formatTaskType(task.type)].label}`)
        .setStyle(ButtonStyle.Primary)
    );
    embeds.push(embed);
    if (task.type == "assistant_reply" || task.type == "prompter_reply") {
      task.conversation.messages.forEach((x, i) => {
        var username = "User";
        if (x.is_assistant) username = "AI";

        var emb = new EmbedBuilder()
          .setAuthor({
            iconURL: `${
              username == "User"
                ? "https://open-assistant.io/images/temp-avatars/av1.jpg"
                : "https://open-assistant.io/images/logos/logo.png"
            }`,
            name: username,
          })
          .setDescription(x.text)
          .setFooter({ text: x.frontend_message_id });
        if (i == task.conversation.messages.length - 1) {
          emb.setColor("#3a82f7");
        }
        embeds.push(emb);
      });
    }
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`open-assistant_label_${task.id}_${interaction.user.id}`)
        .setLabel(`${translation[formatTaskType(task.type)].label}`)
        .setStyle(ButtonStyle.Primary)
    );
    embeds.push(embed);
    task.conversation.messages.forEach((x, i) => {
      var username = "User";
      if (x.is_assistant) username = "AI";

      var emb = new EmbedBuilder()
        .setAuthor({
          iconURL: `${
            username == "User"
              ? "https://open-assistant.io/images/temp-avatars/av1.jpg"
              : "https://open-assistant.io/images/logos/logo.png"
          }`,
          name: username,
        })
        .setDescription(x.text)
        .setFooter({ text: x.frontend_message_id });
      if (i == task.conversation.messages.length - 1) {
        emb.setColor("#3a82f7");
      }
      embeds.push(emb);
    });
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`open-assistant_skip_${task.id}_${interaction.user.id}`)
      .setLabel(`${translation.skip}`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setLabel("Change language")
      .setCustomId(`open-assistant_lang-btn_n_${interaction.user.id}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false)
  );
  rows.push(row);
  await interaction.editReply({
    components: rows,
    embeds: embeds,
  });
}

async function sendErr(err: string) {
  var embed = new EmbedBuilder()
    .setColor("#F73A3A")
    .setDescription(err)
    .setTimestamp();
  return embed;
}

function formatTaskType(type: string) {
  if (type == "assistant_reply") {
    return "reply_as_assistant";
  } else if (type == "user_reply" || type == "prompter_reply") {
    return "reply_as_user";
  } else if (type == "initial_prompt") {
    return "create_initial_prompt";
  } else {
    return type;
  }
}

export async function langInteraction(interaction) {
  var arr: { value: string; label: string }[] = locales.map((x) => {
    return {
      value: x,
      label: getLocaleDisplayName(x),
    };
  });
  var embed = new EmbedBuilder()
    .setColor("#3a82f7")
    .setThumbnail("https://open-assistant.io/images/logos/logo.png")
    .setTitle("Select the lang.")
    .setDescription(
      `By selecting a language you accept our [tos](https://open-assistant.io/terms-of-service)`
    );
  //   .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`open-assistant_lang_n_${interaction.user.id}`)
      .setPlaceholder("Nothing selected")
      .setMinValues(1)
      .setMaxValues(1)
      .setOptions(arr)
  );
  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });
}
export async function initInteraction(interaction, translation, lang) {
  var embed = new EmbedBuilder()
    .setColor("#3a82f7")
    .setTimestamp()
    .setFooter({ text: `${getLocaleDisplayName(lang)}` })
    .setTitle("Open assistant")
    .setDescription(`${translation["conversational"]}`)
    .setURL("https://open-assistant.io/?ref=turing")
    .setThumbnail("https://open-assistant.io/images/logos/logo.png");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(translation.about)
      .setCustomId(`open-assistant_info_n_${interaction.user.id}`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setLabel(translation.grab_a_task)
      .setCustomId(`open-assistant_tasks_n_${interaction.user.id}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(false),
    new ButtonBuilder()
      .setLabel("Change language")
      .setCustomId(`open-assistant_lang-btn_n_${interaction.user.id}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false)
  );
  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });
}

var locales = [
  "en",
  "ar",
  "bn",
  "ca",
  "da",
  "de",
  "es",
  "eu",
  "fa",
  "fr",
  "gl",
  "hu",
  "it",
  "ja",
  "ko",
  "pl",
  "pt-BR",
  "ru",
  "uk-UA",
  "vi",
  "zh",
  "th",
  "tr",
  "id",
];
const missingDisplayNamesForLocales = {
  eu: "Euskara",
  gl: "Galego",
};

/**
 * Returns the locale's name.
 */
export const getLocaleDisplayName = (
  locale: string,
  displayLocale = undefined
) => {
  // Intl defaults to English for locales that are not oficially translated
  if (missingDisplayNamesForLocales[locale]) {
    return missingDisplayNamesForLocales[locale];
  }
  const displayName = new Intl.DisplayNames([displayLocale || locale], {
    type: "language",
  }).of(locale);
  // Return the Titlecased version of the language name.
  return displayName.charAt(0).toLocaleUpperCase() + displayName.slice(1);
};
