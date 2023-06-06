import {AzureTranslationResult} from '../../types/azureResult';
import {IExistingServiceIO} from '../utils/existingServiceIO';
import {Messages} from '../../views/chat/messages/messages';
import {HTTPRequest} from '../../utils/HTTP/HTTPRequest';
import {MessageContent} from '../../types/messages';
import {CompletionsHandlers} from '../serviceIO';
import {AiAssistant} from '../../aiAssistant';
import {AzureUtils} from './utils/azureUtils';
import {Result} from '../../types/result';
import {Azure} from '../../types/azure';

export class AzureTranslationIO extends IExistingServiceIO {
  override insertKeyPlaceholderText = 'Azure Translate Subscription Key';
  override getKeyLink =
    // eslint-disable-next-line max-len
    'https://learn.microsoft.com/en-us/azure/api-management/api-management-subscriptions#create-and-manage-subscriptions-in-azure-portal';
  url = '';

  // prettier-ignore
  constructor(aiAssistant: AiAssistant) {
    const config = aiAssistant.existingService?.azure?.translation as NonNullable<Azure['translation']>;
    super(
      aiAssistant,
      AzureUtils.buildTranslationKeyVerificationDetails(config.region as string),
      AzureUtils.buildTranslationHeaders.bind({}, config?.region), config);
    this.url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${config.language || 'es'}`;
  }

  preprocessBody(messages: MessageContent[]) {
    const mostRecentMessageText = messages[messages.length - 1].text;
    if (!mostRecentMessageText) return;
    return [{Text: mostRecentMessageText}];
  }

  override callServiceAPI(messages: Messages, pMessages: MessageContent[], completionsHandlers: CompletionsHandlers) {
    if (!this.requestSettings) throw new Error('Request settings have not been set up');
    const body = this.preprocessBody(pMessages);
    HTTPRequest.request(this, body as unknown as object, messages, completionsHandlers.onFinish);
  }

  override async extractResultData(result: AzureTranslationResult): Promise<Result> {
    if (Array.isArray(result)) {
      return {text: result[0].translations?.[0].text || ''};
    }
    if (result.error) throw result.error;
    return {text: ''};
  }
}
