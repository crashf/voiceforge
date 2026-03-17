"""
XTTS v2 Fine-Tuning Script for Wayne's Voice
=============================================
Run this on Google Colab (free T4 GPU) or any machine with a GPU.

Steps:
1. Upload the training data (data/training/wayne/) to Colab
2. Run this script
3. Download the fine-tuned model files
4. Copy them to the VoiceForge server

Expected training time: ~30-40 minutes on T4 GPU
"""
import os
from trainer import Trainer, TrainerArgs
from TTS.config.shared_configs import BaseDatasetConfig
from TTS.tts.datasets import load_tts_samples
from TTS.tts.layers.xtts.trainer.gpt_trainer import GPTArgs, GPTTrainer, GPTTrainerConfig, XttsAudioConfig
from TTS.utils.manage import ModelManager

# ── Config ──
RUN_NAME = "GPT_XTTS_Wayne_FT"
PROJECT_NAME = "XTTS_Wayne"
OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "run", "training")
os.makedirs(OUT_PATH, exist_ok=True)

# Training params — optimized for small dataset
BATCH_SIZE = 2
GRAD_ACUMM_STEPS = 126  # BATCH_SIZE * GRAD_ACUMM_STEPS >= 252

# Dataset config
config_dataset = BaseDatasetConfig(
    formatter="ljspeech",
    dataset_name="wayne_voice",
    path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "training", "wayne"),
    meta_file_train=os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "training", "wayne", "metadata.csv"),
    language="en",
)

DATASETS_CONFIG_LIST = [config_dataset]

# Download XTTS v2 base model files for transfer learning
CHECKPOINTS_OUT_PATH = os.path.join(OUT_PATH, "XTTS_v2_original_model_files/")
os.makedirs(CHECKPOINTS_OUT_PATH, exist_ok=True)

DVAE_CHECKPOINT_LINK = "https://coqui.gateway.scarf.sh/hf-coqui/XTTS-v1/v1.1.2/dvae.pth"
MEL_NORM_LINK = "https://coqui.gateway.scarf.sh/hf-coqui/XTTS-v1/v1.1.2/mel_stats.pth"
DVAE_CHECKPOINT = os.path.join(CHECKPOINTS_OUT_PATH, "dvae.pth")
MEL_NORM_FILE = os.path.join(CHECKPOINTS_OUT_PATH, "mel_stats.pth")

if not os.path.isfile(DVAE_CHECKPOINT) or not os.path.isfile(MEL_NORM_FILE):
    print(" > Downloading DVAE files!")
    ModelManager._download_model_files([MEL_NORM_LINK, DVAE_CHECKPOINT_LINK], CHECKPOINTS_OUT_PATH, progress_bar=True)

TOKENIZER_FILE_LINK = "https://coqui.gateway.scarf.sh/hf-coqui/XTTS-v2/v2.0.2/vocab.json"
XTTS_CHECKPOINT_LINK = "https://coqui.gateway.scarf.sh/hf-coqui/XTTS-v2/v2.0.2/model.pth"
TOKENIZER_FILE = os.path.join(CHECKPOINTS_OUT_PATH, "vocab.json")
XTTS_CHECKPOINT = os.path.join(CHECKPOINTS_OUT_PATH, "model.pth")

if not os.path.isfile(TOKENIZER_FILE) or not os.path.isfile(XTTS_CHECKPOINT):
    print(" > Downloading XTTS v2 files!")
    ModelManager._download_model_files(
        [TOKENIZER_FILE_LINK, XTTS_CHECKPOINT_LINK], CHECKPOINTS_OUT_PATH, progress_bar=True
    )

# Speaker reference for test sentences during training
SPEAKER_REFERENCE = [
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "training", "wayne", "wavs", "wayne_0000.wav")
]
LANGUAGE = "en"


def main():
    model_args = GPTArgs(
        max_conditioning_length=132300,  # 6 secs
        min_conditioning_length=66150,   # 3 secs
        debug_loading_failures=False,
        max_wav_length=255995,           # ~11.6 seconds
        max_text_length=200,
        mel_norm_file=MEL_NORM_FILE,
        dvae_checkpoint=DVAE_CHECKPOINT,
        xtts_checkpoint=XTTS_CHECKPOINT,
        tokenizer_file=TOKENIZER_FILE,
        gpt_num_audio_tokens=8194,
        gpt_start_audio_token=8192,
        gpt_stop_audio_token=8193,
    )

    audio_config = XttsAudioConfig(sample_rate=22050, dvae_sample_rate=22050, output_sample_rate=24000)

    config = GPTTrainerConfig(
        epochs=5,  # Small dataset, few epochs to avoid overfitting
        output_path=OUT_PATH,
        model_args=model_args,
        run_name=RUN_NAME,
        project_name=PROJECT_NAME,
        run_description="XTTS v2 fine-tuning on Wayne's voice",
        dashboard_logger="tensorboard",
        audio=audio_config,
        batch_size=BATCH_SIZE,
        batch_group_size=48,
        eval_batch_size=BATCH_SIZE,
        num_loader_workers=4,
        eval_split_max_size=256,
        print_step=25,
        plot_step=100,
        log_model_step=500,
        save_step=1000,
        save_n_checkpoints=1,
        save_checkpoints=True,
        print_eval=False,
        optimizer="AdamW",
        optimizer_wd_only_on_weights=True,
        optimizer_params={"betas": [0.9, 0.96], "eps": 1e-8, "weight_decay": 1e-2},
        lr=5e-06,
        lr_scheduler="MultiStepLR",
        lr_scheduler_params={"milestones": [50000 * 18, 150000 * 18, 300000 * 18], "gamma": 0.5, "last_epoch": -1},
        test_sentences=[
            {
                "text": "Hello, this is Wayne from Pund IT. How can I help you today?",
                "speaker_wav": SPEAKER_REFERENCE,
                "language": LANGUAGE,
            },
            {
                "text": "Thank you for calling. I'll transfer you to the right department now.",
                "speaker_wav": SPEAKER_REFERENCE,
                "language": LANGUAGE,
            },
        ],
    )

    model = GPTTrainer.init_from_config(config)

    train_samples, eval_samples = load_tts_samples(
        DATASETS_CONFIG_LIST,
        eval_split=True,
        eval_split_max_size=config.eval_split_max_size,
        eval_split_size=config.eval_split_size,
    )

    trainer = Trainer(
        TrainerArgs(
            restore_path=None,
            skip_train_epoch=False,
            start_with_eval=True,
            grad_accum_steps=GRAD_ACUMM_STEPS,
        ),
        config,
        output_path=OUT_PATH,
        model=model,
        train_samples=train_samples,
        eval_samples=eval_samples,
    )
    trainer.fit()


if __name__ == "__main__":
    main()
