import sys,os
from fastapi import FastAPI
import argparse
import importlib
from torch import no_grad, LongTensor
import builtins

# models
from enum import Enum
from typing import List
from pydantic import BaseModel, Field, validator, constr
import torch

from models import SynthesizerTrn
from text import text_to_sequence
import commons as commons
import utils

device = "cuda:0" if torch.cuda.is_available() else "cpu"

language_marks = {
    "Japanese": "",
    "日本語": "[JA]",
    "简体中文": "[ZH]",
    "English": "[EN]",
    "Mix": "",
}
lang = ['日本語', '简体中文', 'English', 'Mix']

def get_text(text, hps, is_symbol):

    text_norm = text_to_sequence(text, hps.symbols, [] if is_symbol else hps.data.text_cleaners)
    if hps.data.add_blank:
        text_norm = commons.intersperse(text_norm, 0)
    text_norm = LongTensor(text_norm)
    return text_norm

class VITSText2VoiceRequest(BaseModel):
    text: str


class VITSText2VoiceResponse(BaseModel):
    status: str 
    audios: str

class VITSHijack():
    def __init__(self, app: FastAPI) -> None:
        self.app = app
        self.__start_init__()
        
        self.app.add_api_route("/vits/text2voice", self.text2voice, methods=["POST"], response_model=VITSText2VoiceResponse)

    def __start_init__(self):
        parser = argparse.ArgumentParser()
        parser.add_argument("--model_dir", default="./server/apis/VITS-fast-fine-tuning/pretrained_models/G_0.pth", help="directory to your fine-tuned model")
        parser.add_argument("--config_dir", default="./server/apis/VITS-fast-fine-tuning/configs/finetune_speaker.json", help="directory to your model config file")
        parser.add_argument("--share", default=False, help="make link public (used in colab)")
        
        args = parser.parse_args()

        hps = utils.get_hparams_from_file(args.config_dir)


        net_g = SynthesizerTrn(
            len(hps.symbols),
            hps.data.filter_length // 2 + 1,
            hps.train.segment_size // hps.data.hop_length,
            n_speakers=hps.data.n_speakers,
            **hps.model).to(device)
        _ = net_g.eval()

        _ = utils.load_checkpoint(args.model_dir, net_g, None)
        speaker_ids = hps.speakers
        self.tts_fn = self.create_tts_fn(net_g, hps, speaker_ids)

    def create_tts_fn(self, model, hps, speaker_ids):
        def tts_fn(text, speaker, language, speed):
            if language is not None:
                text = language_marks[language] + text + language_marks[language]
            speaker_id = speaker_ids[speaker]
            stn_tst = get_text(text, hps, False)
            with no_grad():
                x_tst = stn_tst.unsqueeze(0).to(device)
                x_tst_lengths = LongTensor([stn_tst.size(0)]).to(device)
                sid = LongTensor([speaker_id]).to(device)
                audio = model.infer(x_tst, x_tst_lengths, sid=sid, noise_scale=.667, noise_scale_w=0.8,
                                    length_scale=1.0 / speed)[0][0, 0].data.cpu().float().numpy()
            del stn_tst, x_tst, x_tst_lengths, sid
            return "Success", (hps.data.sampling_rate, audio)

        return tts_fn

    def text2voice(self, request: VITSText2VoiceRequest):
        import scipy.io.wavfile as wav
        import numpy as np
        import io
        import base64
        status, (sample_rate, data) = self.tts_fn(request.text, '特别周 Special Week (Umamusume Pretty Derby)', '简体中文', 1.0)
        data = data / np.max(np.abs(data))
        # 将数组转换为16位有符号整数类型
        if data.dtype in [np.float64, np.float32, np.float16]:
            data = data / np.abs(data).max()
            data = data * 32767
            data = data.astype(np.int16)
        elif data.dtype == np.int32:
            data = data / 65538
            data = data.astype(np.int16)
        elif data.dtype == np.int16:
            pass
        elif data.dtype == np.uint16:
            data = data - 32768
            data = data.astype(np.int16)
        elif data.dtype == np.uint8:
            data = data * 257 - 32768
            data = data.astype(np.int16)
        else:
            raise ValueError(
                "Audio data cannot be converted automatically from "
                f"{data.dtype} to 16-bit int format."
            )

        # 将数组存储为wav格式的音频文件
        wav_file = io.BytesIO()
        wav.write(wav_file, sample_rate, data)
        wav_file.seek(0)

        # 将音频文件内容转换为Base64编码格式
        audios = base64.b64encode(wav_file.read()).decode("utf-8")

        return VITSText2VoiceResponse(status=status, audios=audios)

