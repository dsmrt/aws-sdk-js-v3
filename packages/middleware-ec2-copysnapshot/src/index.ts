import {
    MetadataBearer, 
    Middleware,
    Handler,
    HandlerArguments,
    HandlerExecutionContext,
    Provider,
    RequestSerializer,
    HashConstructor,
    DateInput,
    QueryParameterBag,
    Credentials,
    HttpEndpoint,
    Encoder,
    Decoder
} from '@aws-sdk/types';
import {formatUrl} from '@aws-sdk/util-format-url';
import {QuerySerializer} from '@aws-sdk/protocol-query';
import {QueryBuilder} from '@aws-sdk/query-builder';
import {presignRequestQuery} from '@aws-sdk/query-request-presigner';

export interface CopySnapshotInput {
    SourceRegion: string,
    DestinationRegion?: string,
    PresignedUrl?: string
}

//an initialize middleware to add PresignUrl to input
export function addPresignedUrl<
    Input extends CopySnapshotInput,
    Output extends MetadataBearer
>({
    region: regionProvider,
    credentials: credentialsProvider,
    endpoint: endpointProvider,
    base64Encoder,
    utf8Decoder,
    sha256,
}: AddPresignedUrlParameters): Middleware<Input, Output> {
    return (
        next: Handler<Input, Output>,
        {model}: HandlerExecutionContext
    ): Handler<Input, Output> => async (
        args: HandlerArguments<Input>
    ): Promise<Output> => {
        const {input: originalInput} = args;
        //shallow copy of originalInput object
        let input = {
            ...originalInput as CopySnapshotInput
        }
        if (!originalInput.PresignedUrl) {
            //DestinationRegion should always be client region
            input.DestinationRegion = await regionProvider();
            //construct a presigned url using source region endpoint
            const resolvedEndpoint = await endpointProvider();
            const requestSerializer = new QuerySerializer(
                resolvedEndpoint, 
                new QueryBuilder(base64Encoder, utf8Decoder, 'ec2'),
            );
            let request = requestSerializer.serialize(model, input);
            const presignedRequest = await presignRequestQuery(request, {
                //FIXME: need an endpoint provider for given region
                endpoint: {
                    ...resolvedEndpoint,
                    hostname: `ec2.${input.SourceRegion}.amazonaws.com`,
                },
                credentials: await credentialsProvider(),
                sha256,
                signingName: 'ec2',
                signingRegion: input.SourceRegion,
            })
            input.PresignedUrl = formatUrl(presignedRequest);
        }
        const revisedArgs = {...args, input: input as Input};
        return next(revisedArgs)
    }
}

/**
 * Config of the middleware to automatically add presigned URL to request.
 * The presigned URL is generated by sigV4 
 */
export interface AddPresignedUrlParameters {
    /**
     * Region provider used to sign the presigned URL
     */
    region: Provider<string>,
    /**
     * Credentials provider used to sign the presigned URL
     */
    credentials: Provider<Credentials>,
    /**
     * Endpoint provider of the original request.
     */
    endpoint: Provider<HttpEndpoint>,
    /**
     * Encoder to encode the blob input when generate presigned URL
     */
    base64Encoder: Encoder,
    /**
     * Decoder to decode input string when generate presigned URL
     */
    utf8Decoder: Decoder,
    /**
     * Hashing class used by signer
     */
    sha256: HashConstructor,
}