import {CompletionsHandlers, FileServiceIO, KeyVerificationHandlers, ServiceIO, StreamHandlers} from '../serviceIO';
import {RemarkableConfig} from '../../views/chat/messages/remarkable/remarkableConfig';
import {ValidateMessageBeforeSending} from '../../types/validateMessageBeforeSending';
import {RequestHeaderUtils} from '../../utils/HTTP/RequestHeaderUtils';
import {RequestInterceptor} from '../../types/requestInterceptor';
import {OpenAI, OpenAIAudioConfig} from '../../types/openAI';
import {Messages} from '../../views/chat/messages/messages';
import {RequestSettings} from '../../types/requestSettings';
import {FileAttachments} from '../../types/fileAttachments';
import {OpenAIAudioResult} from '../../types/openAIResult';
import {FilesServiceConfig} from '../../types/fileService';
import {HTTPRequest} from '../../utils/HTTP/HTTPRequest';
import {MessageContent} from '../../types/messages';
import {GenericButton} from '../../types/button';
import {OpenAIUtils} from './utils/openAIUtils';
import {AiAssistant} from '../../aiAssistant';
import {Remarkable} from 'remarkable';

export class OpenAIAudioIO implements ServiceIO {
  private static readonly AUDIO_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
  private static readonly DEFAULT_MODEL = 'whisper-1';

  introPanelMarkUp = `
    <div style="width: 100%; text-align: center; margin-left: -10px"><b>OpenAI Images</b></div>
    <p><b>Insert text</b> to generate an image.</p>
    <p><b>Upload 1</b> image to generate a variation and optionally insert text to specify the change.</p>
    <p><b>Upload 2</b> images where the second is a copy of the first with a transparent area where the edit should
      take place and text to specify the edit.</p>
    <p>Click <a href="https://platform.openai.com/docs/guides/images/introduction">here</a> for more info.</p>`;

  url = ''; // set dynamically
  canSendMessage: ValidateMessageBeforeSending = OpenAIAudioIO.canSendMessage;
  // permittedErrorPrefixes = new Set('Invalid input image');
  audio: FileServiceIO = {
    files: {acceptedFormats: '.mp3', dragAndDrop: {acceptedFileNamePostfixes: ['mp3']}},
  };
  private readonly _maxCharLength: number = OpenAIUtils.FILE_MAX_CHAR_LENGTH;
  requestSettings: RequestSettings = {};
  private readonly _raw_body: OpenAIAudioConfig = {model: OpenAIAudioIO.DEFAULT_MODEL};
  requestInterceptor: RequestInterceptor = (details) => details;

  constructor(aiAssistant: AiAssistant, key?: string) {
    const {openAI, inputCharacterLimit, validateMessageBeforeSending} = aiAssistant;
    if (inputCharacterLimit) this._maxCharLength = inputCharacterLimit;
    const config = openAI?.audio as OpenAI['audio'];
    const requestSettings = (typeof config === 'object' ? config.request : undefined) || {};
    if (key) this.requestSettings = key ? OpenAIUtils.buildRequestSettings(key, requestSettings) : requestSettings;
    const remarkable = RemarkableConfig.createNew();
    if (config && typeof config !== 'boolean') {
      OpenAIAudioIO.processAudioConfig(this.audio, remarkable, config.files, config.button);
      if (config.interceptor) this.requestInterceptor = config.interceptor;
      OpenAIAudioIO.cleanConfig(config);
      config.model ??= OpenAIAudioIO.DEFAULT_MODEL;
      this._raw_body = config;
    }
    if (validateMessageBeforeSending) this.canSendMessage = validateMessageBeforeSending;
  }

  private static canSendMessage(text: string, files?: File[]) {
    return !!files?.[0] || text.trim() !== '';
  }

  // prettier-ignore
  private static processAudioConfig(_audio: FileServiceIO, remarkable: Remarkable, files?: FileAttachments,
      button?: GenericButton) {
    if (files && _audio.files) {
      if (_audio.files.infoModal) {
        Object.assign(_audio.files.infoModal, files.infoModal);
        const markdown = files.infoModal?.textMarkDown;
        _audio.infoModalTextMarkUp = remarkable.render(markdown || '');
      }
      if (files.acceptedFormats) _audio.files.acceptedFormats = files.acceptedFormats;
      if (files.maxNumberOfFiles) _audio.files.maxNumberOfFiles = files.maxNumberOfFiles;
      if (typeof files.dragAndDrop !== undefined) _audio.files.dragAndDrop = files.dragAndDrop;
    }
    if (button) {
      _audio.button = button;
      if (_audio.button.styles) _audio.button.default = _audio.button.styles;
    }
  }

  private static cleanConfig(config: FilesServiceConfig) {
    delete config.files;
    delete config.button;
    delete config.request;
    delete config.interceptor;
  }

  private addKey(onSuccess: (key: string) => void, key: string) {
    this.requestSettings = OpenAIUtils.buildRequestSettings(key, this.requestSettings);
    onSuccess(key);
  }

  // prettier-ignore
  verifyKey(inputElement: HTMLInputElement, keyVerificationHandlers: KeyVerificationHandlers) {
    OpenAIUtils.verifyKey(inputElement, this.addKey.bind(this, keyVerificationHandlers.onSuccess),
      keyVerificationHandlers.onFail, keyVerificationHandlers.onLoad);
  }

  private static createFormDataBody(body: OpenAIAudioConfig, audio: File) {
    const formData = new FormData();
    formData.append('file', audio);
    Object.keys(body).forEach((key) => {
      formData.append(key, String(body[key as keyof OpenAIAudioConfig]));
    });
    return formData;
  }

  private preprocessBody(body: OpenAIAudioConfig, messages: MessageContent[]) {
    const bodyCopy = JSON.parse(JSON.stringify(body));
    if (messages[messages.length - 1].content.trim() !== '') {
      const mostRecentMessageText = messages[messages.length - 1].content;
      const processedMessage = mostRecentMessageText.substring(0, this._maxCharLength);
      bodyCopy.prompt = processedMessage;
    }
    return bodyCopy;
  }

  // prettier-ignore
  callApi(messages: Messages, completionsHandlers: CompletionsHandlers, _: StreamHandlers, files?: File[]) {
    if (!this.requestSettings?.headers) throw new Error('Request settings have not been set up');
    if (!files?.[0]) throw new Error('No file was added');
    this.url = this.requestSettings.url || OpenAIAudioIO.AUDIO_TRANSCRIPTION_URL;
    const body = this.preprocessBody(this._raw_body, messages.messages);
    const formData = OpenAIAudioIO.createFormDataBody(body, files[0]);
    // need to pass stringifyBody boolean separately as binding is throwing an error for some reason
    RequestHeaderUtils.temporarilyRemoveContentType(this.requestSettings,
      HTTPRequest.request.bind(this, this, formData, messages, completionsHandlers.onFinish), false);
  }

  extractResultData(result: OpenAIAudioResult): string {
    if (result.error) throw result.error.message;
    return result.text;
  }
}