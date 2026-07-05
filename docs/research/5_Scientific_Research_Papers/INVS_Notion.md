- Documentacion api notion
    - Webhooks
        
        ### **Webhooks**
        
        Webhooks let your integration receive real-time updates from Notion. Whenever a page or database changes, Notion sends a secure HTTP POST request to your webhook endpoint. This allows your application to respond to workspace activity as it happens — whether that's syncing data, triggering automation, or keeping your UI in sync with user activity.
        
        ![](https://files.readme.io/cf4e4b4cbb5de9c5b1277b35386a21574b4960af36c14fe7d648d905377db478-image.png)
        
        **Think of it like this:** Instead of repeatedly polling the Notion API to check if anything has changed, Notion will tell you the moment something important happens.
        
        # **How webhooks work: A simple example**
        
        **Let’s walk through an example from start to finish:**
        
        1. Your integration is subscribed to `page.content_updated` events.
        2. A user edits the title of a page in Notion.
        3. Within a minute, Notion sends a webhook request to your configured endpoint.
        4. The event payload includes metadata such as the page ID, the event type, and a timestamp.
        5. Your server receives the event, verifies it, and calls the Notion API to fetch the updated title using the page ID from the event.
        6. Your application updates its internal data or takes any other action you’ve defined.
        
        This flow lets you react quickly to user activity, without polling or guessing when something has changed.
        
        # **Getting started with webhooks**
        
        ## **Step 1: Creating a webhook subscription**
        
        To receive webhook events, you’ll need to create a subscription through your integration settings.
        
        **You’ll need to:**
        
        1. Visit your [integration settings](https://www.notion.so/profile/integrations).
        2. Either create a new integration or select an existing one.
        3. Navigate to the **Webhooks** tab and click **+ Create a subscription**.
            
            ![](https://files.readme.io/522e40363df1bd7437239b25a1caacc8cc607426f45fc90febfff5f00647aeb4-webhooks-1.png)
            
        4. Enter your public **Webhook URL** — this is the public endpoint where you want Notion to send events. It must be a secure (SSL) and publicly available endpoint. Endpoints in localhost are not reachable.
            
            ![](https://files.readme.io/1ef497d7b9b3622de379e6907cd722167766413693ac9f1885b59eb028b4e7dd-webhooks-2.png)
            
        5. Choose which event types you'd like to subscribe to. You can modify these later if needed.
        6. Click **Create subscription**.
            
            ![](https://files.readme.io/6e68cad7be75acc8165e29eb2a56a282edba31fdcba78238831466b83a115b8f-webhooks-3.png)
            
        
        At this point, your webhook is created but not yet verified. To complete the setup, you’ll need to confirm that your endpoint can receive and respond to verification.
        
        ## **Step 2: Verifying the subscription**
        
        When you create a subscription, Notion sends a one-time POST request to your webhook URL. The body of the request contains a `verification_token`, which proves that Notion can successfully reach your endpoint.
        
        **Example payload with `verification_token`**:
        
        JSON
        
        `{
          "verification_token": "secret_NOTION_SAMPLE_TOKEN_MASKED_BY_INDRA"
        }`
        
        **You’ll need to:**
        
        1. Inspect the incoming request at your endpoint and extract the `verification_token` from the JSON payload.
            1. (Optional): Securely store this token for payload validation setup later, [in step 3](https://developers.notion.com/reference/webhooks#step-3-validating-event-payloads-recommended).
        2. Go back to the **Webhooks** tab within your Notion integration UI and click **⚠️ Verify** on the bottom left of the page
            
            ![](https://files.readme.io/6e68cad7be75acc8165e29eb2a56a282edba31fdcba78238831466b83a115b8f-webhooks-3.png)
            
        3. Paste the `verification_token` value into the form and click **Verify subscription.**
        
        ![](https://files.readme.io/42b82e16a49278f78ecfdfb6a8f5acafe1ae251376bdc636d43c68abf4f685e5-webhooks-4.png)
        
        If you did not receive a `verification_token`, you can click **Resend token** from the webhook verification modal.
        
        Once submitted, your webhook subscription is considered active, and will start receiving events.
        
        > 🔐Changing your webhook URL or event subscriptions
        > 
        > 
        > You can only change the webhook URL before verification. After verification, if you need to change the URL, you must delete and recreate the subscription. You can change the subscribed events at any time.
        > 
        
        ## **Step 3: Validating event payloads (Recommended)**
        
        To help ensure the security of your integration, Notion includes a cryptographic signature with every webhook event we send. This allows you to verify that the payload was sent by Notion and hasn’t been modified in transit.
        
        While payload validation is optional, we recommend implementing it for any production environment.
        
        > ⚡Using a no-code or low-code platform?
        > 
        > 
        > If you're using a no-code or low-code platform (like Zapier, Make, or Pipedream), you may not have access to custom code for signature verification — and that’s okay. Validation is encouraged, but not required for webhooks to work.
        > 
        
        ### **How it works**
        
        In the previous step, Notion sent a one-time `verification_token` to your webhook URL. You’ll use this token to verify the authenticity of all subsequent webhook events.
        
        Every webhook request from Notion includes an `X-Notion-Signature` header, which contains an HMAC-SHA256 hash of the request body, signed with your `verification_token`.
        
        **Sample `X-Notion-Signature` from Notion**:
        
        JSON
        
        `{
          "X-Notion-Signature": "sha256=461e8cbcba8a75c3edd866f0e71280f5a85cbf21eff040ebd10fe266df38a735"
        }`
        
        To validate the request, you can use the `verification_token` along with the event's payload to recompute the signature and verify the request's authenticity. If they match, the payload is trustworthy.
        
        **Sample code for computing the signature and validating the webhook payload:**
        
        JavaScriptPythonRuby
        
        `import { createHmac, timingSafeEqual } from "crypto"
        
        // Retrieve the `verification_token` from the initial request
        // (subscription verification; Step 2)
        const verificationToken = "secret_NOTION_SAMPLE_TOKEN_MASKED_BY_INDRA"
        
        // This body should come from your request body for subsequent validations
        const body = {"verification_token":"secret_NOTION_SAMPLE_TOKEN_MASKED_BY_INDRA"}
        
        const calculatedSignature = `sha256=${createHmac("sha256", verificationToken).update(JSON.stringify(body)).digest("hex")}`
        
        const isTrustedPayload = timingSafeEqual(
          Buffer.from(calculatedSignature),
          Buffer.from(headers["X-Notion-Signature"]),
        )
        
        if (!isTrustedPayload) {
          // Ignore the event
          return
        }`
        
        Implementing this validation step is a small lift that adds a strong layer of security to your webhook integration. If you ever rotate or recreate your webhook subscription, be sure to update your stored `verification_token`.
        
        # **Testing your webhook subscription**
        
        Once your webhook subscription is set up and verified, it’s a good idea to test that everything is working as expected.
        
        Below are three common test scenarios you can try, each corresponding to a supported event type. These tests simulate typical content updates and help ensure your endpoint is receiving and processing events correctly.
        
        ## **Test 1: Change a page title**
        
        This test checks your webhook’s ability to handle aggregated events, which are delivered with a short delay to avoid sending redundant updates.
        
        **You’ll need to:**
        
        1. In your Notion workspace, add the integration to a page.
        2. Change the title of that page.
        3. Wait a minute or two because aggregated events like `page.content_updated` are batched and may not be sent immediately.
        4. Check your server logs or webhook handler. You should receive a `page.content_updated` event.
        5. Use the entity.id value from the payload to call the `retrieve a page` endpoint and confirm the new title.
        
        ## **Test 2: Add a comment**
        
        This test checks event delivery for comments, which require specific capabilities.
        
        **You’ll need to:**
        
        1. In a page your integration has access to, add a new comment.
        2. Your webhook should receive a `comment.created` event within a few seconds.
        
        **Important:**
        
        To receive this event, your integration must include the `comment read` capability in its configuration. You can confirm this in the **Capabilities** tab of your integration’s settings.
        
        ## **Test 3: Modify a database schema**
        
        This test verifies that structural changes to databases are triggering events.
        
        **You’ll need to:**
        
        1. Open any database your integration is connected to.
        2. Make a schema change — for example, add a new property (column), rename an existing one, or delete a property.
        3. Your webhook should receive a `data_source.schema_updated` (in the new 2025-09-03 API version) or `database.schema_updated` (deprecated after 2022-06-28 API version) event shortly after the change.
        
        # **Troubleshooting tips**
        
        If your webhook isn’t receiving events as expected, here are a few things to double-check. These are the most common reasons developers miss events during setup or testing.
        
        ### **🔒 1. Check access permissions**
        
        Make sure the integration has access to the object that triggered the event. For example, if a new page is created inside a private page your integration doesn’t have access to, the event won’t be triggered.
        
        ### **✅ 2. Confirm capabilities**
        
        Some event types require specific capabilities to be enabled for your integration.
        
        For instance, to receive `comment.created` events, your integration must have the "**comment read**" capability selected. Without it, even if your integration has access to the page, the comment event won’t be delivered.
        
        You can view and update your integration’s capabilities in the **Capabilities** section of your integration settings.
        
        ### **⏳ 3. Understand aggregated event timing**
        
        Not all webhook events are sent immediately. Some, like page.content_updated, are aggregated to reduce noise from frequent edits (e.g., typing, formatting, moving blocks). This is normal and helps group multiple rapid changes into a single webhook event.
        
        See [Event Delivery](https://developers.notion.com/reference/webhooks-events-delivery#event-delivery) for a deeper explanation.
        
        **Tip**: If you're testing and expecting an instant response, start with non-aggregated events like `comment.created` or `page.locked`.
        
        ### **☑️ Confirm your subscription status**
        
        Even if everything else is configured correctly, your webhook won’t receive events unless the subscription is active.
        
        Head to the **Webhooks** tab under your integration settings and make sure your subscription is **active**. If the status shows as **paused**, **pending verification**, or if the subscription was deleted, events won’t be delivered to your endpoint.
        
    - **Working with page content**Learn about page content and how to add or retrieve it with the Notion API.[Suggest Edits](https://developers.notion.com/edit/working-with-page-content)
        
        ## **Overview**
        
        [Pages](https://www.notion.so/help/category/write-edit-and-customize) are where users write everything from quick notes, to shared documents, to curated landing pages in Notion. Integrations can help users turn Notion into the single source of truth by syndicating content or help users gather, connect, and visualize content inside Notion.
        
        In this guide, you'll learn about how the building blocks of page content are represented in the API and what you can do with them. By the end, you'll be able to create new pages with content, read content from other pages, and add blocks to existing pages.
        
        ### **Page content versus properties**
        
        In general, **page properties** are best for capturing structured information such as a due date, a category, or a relationship to another page. **Page content** is best for looser structures or free form content. Page content is where users compose their thoughts or tell a story. Page properties are where users capture data and build systems. Your integration should aim to use each in the way users expect.
        
        ![2238](https://files.readme.io/369b6a5-page-properties-and-content.png)
        
        Visualizing page properties versus page content
        
        ## **Modeling content as blocks**
        
        A page's content is represented by a list of [block objects](https://developers.notion.com/reference/block). These blocks are referred to as the page's children. Each block has a type, such as a paragraph, a heading, or an image. Some types of blocks, such as a toggle list, have children of their own.
        
        Let's start with a simple example, a [paragraph block](https://developers.notion.com/reference/block#paragraph-blocks):
        
        JavaScript
        
        `{
          "object": "block",
          "id": "380c78c0-e0f5-4565-bdbd-c4ccb079050d",
          "type": "paragraph",
          "created_time": "",
          "last_edited_time": "",
          "has_children": false,
        
          "paragraph": {
            "text": [/* details omitted */]
          }
        }`
        
        Paragraph blocks include common properties which every block includes: `object`, `type`, `created_time`, `last_edited_time`, and `has_children`. In addition, it contains type-specific information inside the `paragraph` property. Paragraph blocks have a `text` property. Other block types have different type-specific properties.
        
        Now let's look at an example where the block has child blocks: a paragraph followed by an indented [todo block](https://developers.notion.com/reference/block#to-do-blocks):
        
        JavaScript
        
        `{
          "object": "block",
          "id": "380c78c0-e0f5-4565-bdbd-c4ccb079050d",
          "type": "paragraph",
          "created_time": "",
          "last_edited_time": "",
          "has_children": true,
        
          "paragraph": {
            "text": [/* details omitted */],
            "children": [
              {
                "object": "block",
                "id": "6d5b2463-a1c1-4e22-9b3b-49b3fe7ad384",
                "type": "to_do",
                "created_time": "",
                "last_edited_time": "",
                "has_children": false,
          
                "to_do": {
                  "text": [/* details omitted */],
                  "checked": false
                }
              }
            ]
          }
        }`
        
        Child blocks are represented as a list of blocks inside the type-specific property. When a block has children, the `has_children` property is `true`. Only some block types, like paragraph blocks, support children.
        
        > 📘Pages are also blocks
        > 
        > 
        > Pages are a special kind of block, but they have children like many other block types. When [retrieving a list of child blocks](https://developers.notion.com/reference/get-block-children), you can use the page ID as a block ID.
        > 
        > When a child page appears inside another page, it's represented as a `child_page` block, which does not have children. You should think of this as a reference to the page block.
        > 
        
        > 🚧Unsupported block types
        > 
        > 
        > The Notion API currently supports a subset of Notion [block](https://developers.notion.com/reference/block#block-type-object) types, with support for more coming soon. When an unsupported block type appears in a page, it will have the type `"unsupported"`.
        > 
        
        ### **Rich text**
        
        In the previous block examples, the omitted value of the text property is a list of [rich text objects](https://developers.notion.com/reference/rich-text). Rich text objects can describe more than a simple string - the object includes style information, links, mentions, and more.
        
        Let's look at a simple example that just contains the words "Grocery List":
        
        JavaScript
        
        `{
          "type": "text",
          "text": {
            "content": "Grocery List",
            "link": null
          },
          "annotations": {
            "bold": false,
            "italic": false,
            "strikethrough": false,
            "underline": false,
            "code": false,
            "color": "default"
          },
          "plain_text": "Grocery List",
          "href": null
        }`
        
        Rich text objects follow a similar pattern for type-specific configuration. The rich text object above has a type of `"text"`, and it has additional configuration related to that type in the `text` property. Other information that does not depend on the type, such as `annotations`, `plain_text`, and `href`, are at the top level of the rich text object.
        
        Rich text is used both in page content and inside [page property values](https://developers.notion.com/reference/page-property-values).
        
        ## **Creating a page with content**
        
        Pages can be created with child blocks using the [create a page](https://developers.notion.com/reference/post-page) endpoint. This endpoint supports creating a page within another page, or creating a page within a database.
        
        Let's try creating a page within another page with some sample content. We will use all three parameters for this endpoint. The parent parameter is a [page parent](https://developers.notion.com/reference/page#page-parent). We can build this object using an existing page ID:
        
        JavaScript
        
        `{
          "type": "page_id",
          "page_id": "494c87d0-72c4-4cf6-960f-55f8427f7692"
        }`
        
        > 📘Permissions
        > 
        > 
        > Before an integration can create a page within another page, it needs access to the page parent. To share a page with an integration, click the `•••` menu at the top right of a page, scroll to `Add connections`, and use the search bar to find and select the integration from the dropdown list.
        > 
        
        > 📘Where can I find my page's ID?
        > 
        > 
        > Here's a quick procedure to find the page ID for a specific page in Notion:
        > 
        > 1. Open the page in Notion.
        > 2. Use the Share menu to Copy link.
        > 3. Now paste the link in your text editor so you can take a closer look.
        > 4. The URL ends in a page ID. It should be a 32 character long string. Format this value by inserting hyphens (-) in the following pattern:
        >     1. 8-4-4-4-12 (each number is the length of characters between the hyphens).
        >     2. Example: `1429989fe8ac4effbc8f57f56486db54` becomes `1429989f-e8ac-4eff-bc8f-57f56486db54`.
        >     3. This value is your page ID.
        > 
        > While this procedure is helpful to try the API, **you shouldn't ask users to do this for your integration**. It's more common for an integration to determine a page ID by calling the [search API](https://developers.notion.com/reference/post-search).
        > 
        
        The `properties` parameter is an object which describes the page properties. Let's use a simple example with only the required `title` property:
        
        JavaScript
        
        `{
          "Name": {
            "type": "title",
            "title": [{ "type": "text", "text": { "content": "A note from your pals at Notion" } }]
          }
        }`
        
        > 📘Page properties within a database
        > 
        > 
        > Pages within a database parent require properties to conform to the database's schema. Follow the [working with databases guide](https://developers.notion.com/docs/working-with-databases) for an in-depth discussion with examples.
        > 
        
        The children parameter is a list of [block objects](https://developers.notion.com/docs/working-with-page-content) which describe the page content. Let's use some sample content:
        
        JavaScript
        
        `[
          {
            "object": "block",
            "type": "paragraph",
            "paragraph": {
              "rich_text": [{ "type": "text", "text": { "content": "You made this page using the Notion API. Pretty cool, huh? We hope you enjoy building with us." } }]
            }
          }
        ]`
        
        > 📘Size limits
        > 
        > 
        > When creating new blocks, keep in mind that the Notion API has [size limits](https://developers.notion.com/reference/errors#size-limits) for the content.
        > 
        
        Using all three of the parameters, we create a page by sending a request to [the endpoint](https://developers.notion.com/reference/post-page).
        
        cURLJavaScript
        
        `curl -X POST https://api.notion.com/v1/pages \
          -H 'Authorization: Bearer '"$NOTION_API_KEY"'' \
          -H "Content-Type: application/json" \
          -H "Notion-Version: 2022-06-28" \
          --data '{
        	"parent": { "page_id": "494c87d0-72c4-4cf6-960f-55f8427f7692" },
        	"properties": {
        		"title": {
              "title": [{ "type": "text", "text": { "content": "A note from your pals at Notion" } }]
        		}
        	},
        	"children": [
            {
              "object": "block",
              "type": "paragraph",
              "paragraph": {
                "rich_text": [{ "type": "text", "text": { "content": "You made this page using the Notion API. Pretty cool, huh? We hope you enjoy building with us." } }]
              }
            }
          ]
        }'`
        
        Once the page is added, you'll receive a response containing the new [page object](https://developers.notion.com/reference/page). Take a look inside Notion and view your new page.
        
        ## **Reading blocks from a page**
        
        Page content can be read from a page using the [retrieve block children](https://developers.notion.com/reference/get-block-children) endpoint. This endpoint returns a list of children for any block which supports children. While pages are a common starting point for reading block children, you can retrieve the block children of other kinds of blocks, too.
        
        The `block_id` parameter is the ID of any existing block. If you're following from the example above, the response contained a page ID. Let's use that page ID to read the sample content from the page. We'll use `"16d8004e-5f6a-42a6-9811-51c22ddada12"` as the block ID.
        
        Using this `block_id`, we retrieve the block children by sending a request to [the endpoint](https://developers.notion.com/reference/get-block-children).
        
        cURLJavaScript
        
        `curl https://api.notion.com/v1/blocks/16d8004e-5f6a-42a6-9811-51c22ddada12/children?page_size=100 \
          -H 'Authorization: Bearer '"$NOTION_API_KEY"'' \
          -H "Notion-Version: 2022-06-28"`
        
        You'll receive a response that contains a list of block objects.
        
        JavaScript
        
        `{
          "object": "list",
          "results": [
            {
              "object": "block",
              /* details omitted */
            }
          ],
          "has_more": false,
          "next_cursor": null
        }`
        
        This is a paginated response. Paginated responses are used throughout the Notion API when returning a potentially large list of objects. The maximum number of results in one paginated response is 100. The [pagination reference](https://developers.notion.com/reference/pagination) explains how to use the "start_cursor" and "page_size" parameters to get more than 100 results.
        
        In this case, the individual child blocks we requested are in the "results" array.
        
        ### **Reading nested blocks**
        
        What happens when the results contain a block that has its own children? In this case, the response will not contain those children, but the `has_children` property will be `true`. If your integration needs a complete representation of a page's (or any block's) content, it should search the results for blocks with `has_children` set to `true`, and recursively call the [retrieve block children](https://developers.notion.com/reference/get-block-children) endpoint.
        
        Reading large pages may take some time. We recommend using asynchronous operations in your architecture, such as a job queue. You will also need to be mindful of [rate limits](https://developers.notion.com/reference/errors#rate-limits) to appropriately slow down making new requests after the limit is met.
        
        ## **Appending blocks to a page**
        
        Integrations can add more content to a page by using the [append block children](https://developers.notion.com/reference/patch-block-children) endpoint. Let's try to add another block to the page we created in the example above. This endpoint requires two parameters: `block_id` and `children`.
        
        The `block_id` parameter is the ID of any existing block. If you're following from the example above, let's use the same page ID as the block ID: `"16d8004e-5f6a-42a6-9811-51c22ddada12"`.
        
        The `children` parameter is a list of [block objects](https://developers.notion.com/reference/block) which describe the content we want to append. Let's use some more sample content:
        
        JavaScript
        
        `[
          {
            "object": "block",
            "type": "paragraph",
            "paragraph": {
              "text": [{ "type": "text", "text": { "content": "– Notion API Team", "link": { "type": "url", "url": "https://twitter.com/NotionAPI" } } }]
            }
          }
        ]`
        
        Using both parameters, we append blocks by sending a request to [the endpoint](https://developers.notion.com/reference/patch-block-children).
        
        cURLJavaScript
        
        `curl -X PATCH https://api.notion.com/v1/blocks/16d8004e-5f6a-42a6-9811-51c22ddada12/children \
          -H 'Authorization: Bearer '"$NOTION_API_KEY"'' \
          -H "Content-Type: application/json" \
          -H "Notion-Version: 2022-06-28" \
          --data '{
        	"children": [
            {
              "object": "block",
              "type": "paragraph",
              "paragraph": {
                "text": [{ "type": "text", "text": { "content": "– Notion API Team", "link": { "type": "url", "url": "https://twitter.com/NotionAPI" } } }]
              }
            }
          ]
        }'`
        
        You'll receive a response that contains the updated block. The response does not contain the child blocks, but it will show `has_children` set to `true`.
        
        By default, new block children are appended at the end of the parent block. To place the block after a specific child block and not at the end, use the `after` body parameter. `after` should be set to the ID of the existing child block you are appending the new block after. For example, if the parent `block_id` is for a block that contains a bulleted list, you can set the `after` parameter to the block ID of the list item you want the new block children to be appended after.
        
        cURL
        
        `curl -X PATCH https://api.notion.com/v1/blocks/16d8004e-5f6a-42a6-9811-51c22ddada12/children \
          -H 'Authorization: Bearer '"$NOTION_API_KEY"'' \
          -H "Content-Type: application/json" \
          -H "Notion-Version: 2022-06-28" \
          --data '{
            "children": [
            {
              "object": "block",
              "type": "paragraph",
              "paragraph": {
                "text": [{ "type": "text", "text": { "content": "– Notion API Team", "link": { "type": "url", "url": "https://twitter.com/NotionAPI" } } }]
              }
            }
          ], after: "<block_id_to_append_after>"
        }'`
        
        ## **Conclusion**
        
        Nearly everything users see inside Notion is represented as blocks. Now that you've understood how your integration can build pages with blocks, read blocks, and add blocks to pages - you've unlocked most of the surface area in Notion. You integration can engage users where they do everything from creative writing, to building documentation, and more.
        
    - **Working with databases**Learn about database schemas, querying databases, and more.[Suggest Edits](https://developers.notion.com/edit/working-with-databases)
        
        **Overview**
        
        [Databases](https://www.notion.so/help/intro-to-databases) are collections of [pages](https://developers.notion.com/reference/page) in a Notion workspace that can be filtered, sorted, and organized as needed. They allow users to create and manipulate structured data in Notion.
        
        Integrations can be used to help users sync databases with external systems or build workflows around Notion databases.
        
        In this guide, you'll learn:
        
        - [How databases are represented in the API.](https://developers.notion.com/docs/working-with-databases#structure)
        - [How to add items to a database.](https://developers.notion.com/docs/working-with-databases#adding-pages-to-a-database)
        - [How to find items within databases.](https://developers.notion.com/docs/working-with-databases#finding-pages-in-a-database)
        
        ### **Additional types of databases**
        
        In addition to regular Notion databases, there are two other types of databases to be aware of. *Neither of these database types are currently supported by the Public API.*
        
        ### **Linked databases**
        
        Notion offers [linked databases](https://www.notion.so/help/guides/using-linked-databases) as a way of showing databases in multiple places. You can identify them by a ↗ next to the database title which, when clicked, takes you to the source database.
        
        ![Linked databases are indicated with an arrow next to the name.](https://files.readme.io/b551e28-linkeddb.png)
        
        Linked databases are indicated with an arrow next to the name.
        
        > 🚧
        > 
        > 
        > The Public API does not currently support linked databases. When sharing a database with your integration, make sure it's the **source** one!
        > 
        
        ### **Wiki databases**
        
        Wiki databases are a special category of databases that allow [Workspace Owners](https://www.notion.so/help/add-members-admins-guests-and-groups) to organize child pages and databases with a homepage view. Wiki database pages can be verified by the Workspace Owner with an optional expiration date for the verification.
        
        Pages in a wiki database will have a [`verification`](https://developers.notion.com/reference/page-property-values#verification) property that can be set through your Notion workspace. See directions for [creating wikis](https://www.notion.so/help/wikis-and-verified-pages#create-a-wiki) and [verifying pages](https://www.notion.so/help/wikis-and-verified-pages#verifying-pages) in our Help Center.
        
        Wiki databases can currently only be created through your Notion workspace directly (i.e., not the Public API). To learn more about creating and working with wiki databases, see the following Help Centre articles:
        
        - [Wikis and verified pages](https://www.notion.so/help/wikis-and-verified-pages)
        - [Wiki guides](https://www.notion.so/help/guides/category/wiki)
        
        ## **Structure**
        
        Database objects describe a part of what a user sees in Notion when they open a database. (See our [documentation on database objects](https://developers.notion.com/reference/database) and [database properties](https://developers.notion.com/reference/property-object) for a complete description.) The most important part is the database's schema, defined in the `properties` collection.
        
        > 📘
        > 
        > 
        > The columns of a Notion database are referred to as its “properties” or “schema”.
        > 
        
        JavaScript
        
        `{
          "object": "database",
          
          "id": "2f26ee68-df30-4251-aad4-8ddc420cba3d",
          "created_time": "2020-03-17T19:10:04.968Z",
          "last_edited_time": "2020-03-17T21:49:37.913Z",
          "title": [/* details omitted */],
          "description": [/* details omitted */],
          
          "properties": {/* a collection of property objects */},
          "archived": false,
          "in_trash": false,
          "is_inline": false,
          "public_url": null
        }`
        
        > 🚧Maximum schema size recommendation
        > 
        > 
        > Notion recommends a maximum schema size of **50KB**. Updates to database schemas that are too large will be blocked to help maintain database performance.
        > 
        
        ### **Database properties**
        
        ![Example of a database with three properties (Grocery item, Price, Last ordered).](https://files.readme.io/6a2c69a-databaseproperties.png)
        
        Example of a database with three properties (Grocery item, Price, Last ordered).
        
        Let's assume you're viewing a database as a table. The columns of the database are represented in the API by database [property objects](https://developers.notion.com/reference/property-object). Property objects store a description of a column, including a type for all the values in a column.
        
        You might recognize a few of the common types:
        
        - [Text](https://developers.notion.com/reference/property-object#rich-text)
        - [Numbers](https://developers.notion.com/reference/property-object#number)
        - [Dates](https://developers.notion.com/reference/property-object#date)
        - [People](https://developers.notion.com/reference/property-object#people)
        
        For each type, additional configuration may also be available. Let's take a look at the `properties` section of an example database object.
        
        JavaScript
        
        `{
          "object": "database",
            
          "properties": {
            "Grocery item": {
              "id": "fy:{",
              "type": "title",
              "title": {}
            },
            "Price": {
              "id": "dia[",
              "type": "number",
              "number": {
                "format": "dollar"
              }
            },
            "Last ordered": {
              "id": "]\\R[",
              "type": "date",
              "date": {}
            },
          }
          
          // remaining details omitted
        }`
        
        In this database object, there are three `properties` defined. Each key is the property name and each value is a property object. Here are some key takeaways:
        
        - **The [`"title"`](https://developers.notion.com/reference/property-object#title) type is special.** Every database has exactly one property with the `"title"` type. Properties of this type refer to the page title for each item in the database. In this example, the *Grocery item* property has this type.
        - **The value of `type` corresponds to another key in the property object.** Each property object has a nested property named the same as its `type` value. For example, *Last ordered* has the type `"date"`, and it also has a `date` property. **This pattern is used throughout the Notion API on many objects and we call it type-specific data.**
        - **Certain property object types have additional configuration.** In this example, *Price* has the type `"number"`. [Number property objects](https://developers.notion.com/reference/property-object#number) have additional configuration inside the `number` property. In this example, the `format` configuration is set to `"dollar"` to control the appearance of page property values in this column.
        
        ### **Iterate over a database object**
        
        A query to [Retrieve a database](https://developers.notion.com/reference/retrieve-a-database) returns a database object. You can iterate over the `properties` object in the response to list information about each property. For example:
        
        JavaScript
        
        `Object.entries(database.properties).forEach(([propertyName, propertyValue]) => {
            console.log(`${propertyName}: ${propertyValue.type}`);
        });`
        
        ## **Adding pages to a database**
        
        Pages are used as items inside a database, and each page's properties must conform to its parent database's schema. In other words, if you're viewing a database as a table, a page's properties define all the values in a single row.
        
        > 📘
        > 
        > 
        > If you are [creating a page](https://developers.notion.com/reference/post-page) in a database, the page properties must match the properties of the database. If you are creating a page that is not a child of a database, `title` is the only property that can be set.
        > 
        
        Pages are added to a database using the [Create a page API endpoint](https://developers.notion.com/reference/post-page). Let's try to add a page to the example database above.
        
        The [Create a page](https://developers.notion.com/reference/post-page) endpoint has two required parameters: `parent` and `properties`.
        
        When adding a page to a database, the `parent` parameter must be a [database parent](https://developers.notion.com/reference/parent-object). We can build this object for the example database above:
        
        JavaScript
        
        `{
          "type": "database_id",
          "database_id": "2f26ee68-df30-4251-aad4-8ddc420cba3d"
        }`
        
        > 📘Permissions
        > 
        > 
        > Before an integration can create a page within another page, it needs access to the page parent. To share a page with an integration, click the ••• menu at the top right of a page, scroll to `Add connections`, and use the search bar to find and select the integration from the dropdown list.
        > 
        
        > 📘Where can I find my database's ID?
        > 
        > 
        > Here's a quick procedure to find the database ID for a specific database in Notion:
        > 
        > > Open the database as a full page in Notion. Use the Share menu to Copy link. Now paste the link in your text editor so you can take a closer look. The URL uses the following format:
        > > 
        > > 
        > > ```
        > > https://www.notion.so/{workspace_name}/{database_id}?v={view_id}
        > > 
        > > ```
        > > 
        > > Find the part that corresponds to `{database_id}` in the URL you pasted. It is a 36 character long string. This value is your database ID.
        > > 
        > > Note that when you receive the database ID from the API, e.g. the [search](https://developers.notion.com/reference/post-search) endpoint, it will contain hyphens in the UUIDv4 format. You may use either the hyphenated or un-hyphenated ID when calling the API.
        > > 
        
        The `properties` parameter is an object which uses property names or IDs as keys, and [property value objects](https://developers.notion.com/reference/page-property-values) as values. In order to create this parameter correctly, you refer to the [property objects](https://developers.notion.com/reference/property-object) in the database's schema. We can build this object for the example database above too:
        
        JavaScript
        
        `{
          "Grocery item": {
            "type": "title",
            "title": [{ "type": "text", "text": { "content": "Tomatoes" } }]
          },
          "Price": {
            "type": "number",
            "number": 1.49
          },
          "Last ordered": {
            "type": "date",
            "date": { "start": "2021-05-11" }
          }
        }`
        
        > 📘Building a property value object in code
        > 
        > 
        > Building the property value object manually, as described in this guide, is only helpful when you're working with one specific database that you know about ahead of time. In order to build an integration that works with any database a user picks, and to remain flexible as the user's chosen database inevitably changes in the future, use the [Retrieve a database](https://developers.notion.com/reference/retrieve-a-database) endpoint. Your integration can call this endpoint to get a current database schema, and then create the `properties` parameter in code based on that schema.
        > 
        
        Using both the `parent` and `properties` parameters, we create a page by sending a request to [the endpoint](https://developers.notion.com/reference/post-page).
        
        cURLJavaScript
        
        `curl -X POST https://api.notion.com/v1/pages \
          -H 'Authorization: Bearer '"$NOTION_API_KEY"'' \
          -H "Content-Type: application/json" \
          -H "Notion-Version: 2022-06-28" \
          --data '{
        	  "parent": { "type": "database_id", "database_id": "2f26ee68-df30-4251-aad4-8ddc420cba3d" },
        	  "properties": {
              "Grocery item": {
                "type": "title",
                "title": [{ "type": "text", "text": { "content": "Tomatoes" } }]
              },
              "Price": {
                "type": "number",
                "number": 1.49
              },
              "Last ordered": {
                "type": "date",
                "date": { "start": "2021-05-11" }
              }
            }
          }'`
        
        Once the page is added, you'll receive a response containing the new [page object](https://developers.notion.com/reference/page). An important property in the response is the page ID (`id`). If you're connecting Notion to an external system, it's a good idea to store the page ID. If you want to update the page properties later, you can use the ID with the [Update page properties](https://developers.notion.com/reference/patch-page) endpoint.
        
        ## **Finding pages in a database**
        
        Pages can be read from a database using the [Query a database](https://developers.notion.com/reference/post-database-query) endpoint. This endpoint allows you to find pages based on criteria such as "which page has the most recent Last ordered date". Some databases are very large and this endpoint also allows you to get the results in a specific order, and get the results in smaller batches.
        
        > 📘Getting a specific page
        > 
        > 
        > If you're looking for one specific page and already have it's page ID, you don't need to query a database to find it. Instead, use the [Retrieve a page](https://developers.notion.com/reference/retrieve-a-page) endpoint.
        > 
        
        ### **Filtering database pages**
        
        The criteria used to find pages are called [filters](https://developers.notion.com/reference/post-database-query-filter). Filters can describe simple conditions (i.e. "*Tag* includes *Urgent*") or more complex conditions (i.e. "*Tag* includes *Urgent* AND *Due date* is within the next week AND *Assignee* equals *Cassandra Vasquez*"). These complex conditions are called [compound filters](https://developers.notion.com/reference/post-database-query#compound-filters) because they use "and" or "or" to join multiple single property conditions together.
        
        > 📘Finding all pages in a database
        > 
        > 
        > In order to find all the pages in a database, send a request to the [query a database](https://developers.notion.com/reference/post-database-query) without a `filter` parameter.
        > 
        
        In this guide, let's focus on a single property condition using the example database above. Looking at the database schema, we know the *Last ordered* property uses the type `"date"`. This means we can build a filter for the *Last ordered* property using any [condition for the `"date"` type](https://developers.notion.com/reference/post-database-query-filter#date). The following filter object which matches pages where the *Last ordered* date is in the past week:
        
        JavaScript
        
        `{
          "property": "Last ordered",
          "date": {
            "past_week": {}
          }
        }`
        
        Using this filter, we can find all the pages in the example database which pages the condition.
        
        cURLJavaScript
        
        `curl -X POST https://api.notion.com/v1/databases/2f26ee68df304251aad48ddc420cba3d/query \
          -H 'Authorization: Bearer '"$NOTION_API_KEY"''
          -H "Content-Type: application/json" \
          -H "Notion-Version: 2022-06-28" \
        	--data '{
        	  "filter": {
              "property": "Last ordered",
              "date": {
                "past_week": {}
              }
        		}
        	}'`
        
        You'll receive a response that contains a list of matching [page objects](https://developers.notion.com/reference/page).
        
        JavaScript
        
        `{
          "object": "list",
          "results": [
            {
              "object": "page",
              /* details omitted */
            }
          ],
          "has_more": false,
          "next_cursor": null
        }`
        
        This is a paginated response. Paginated responses are used throughout the Notion API when returning a potentially large list of objects. The maximum number of results in one paginated response is 100. The [pagination reference](https://developers.notion.com/reference/pagination) explains how to use the `"start_cursor"` and `"page_size"` parameters to get more than 100 results.
        
        ### **Sorting database pages**
        
        In this case, the individual pages we requested are in the `"results"` array. What if our integration (or its users) cared most about pages that were created recently? It would be helpful if the results were ordered so that the most recently created page was first, especially if the results didn't fit into one paginated response.
        
        The `sort` parameter is used to order results by individual properties or by timestamps. This parameter can be assigned an array of sort object.
        
        The time which a page was created is not a page property (properties that conform to the database schema). Instead, it's a property that every page has, and it's one of two kinds of timestamps. It is called the `"created_time"` timestamp. Let's build a [sort object](https://developers.notion.com/reference/post-database-query-sort) that orders results so the most recently created page is first:
        
        JavaScript
        
        `{
          "timestamp": "created_time",
          "direction": "descending"
        }`
        
        Finally, let's update the request we made earlier to order the page results using this sort object:
        
        cURLJavaScript
        
        `curl -X POST https://api.notion.com/v1/databases/2f26ee68df304251aad48ddc420cba3d/query \
          -H 'Authorization: Bearer '"$NOTION_API_KEY"''
          -H "Content-Type: application/json" \
          -H "Notion-Version: 2022-06-28" \
        	--data '{
        	  "filter": {
              "property": "Last ordered",
              "date": {
                "past_week": {}
              }
        		},
            "sorts": [{ "timestamp": "created_time", "direction": "descending" }]
        	}'`
        
        ## **Conclusion**
        
        Understanding database schemas, made from a collection of database properties, is key to working with Notion databases. This enables you to add pages to a database and also get find items in a database.
        
        You're ready to help users take advantage of Notion's flexible and extensible database interface to work with more kinds of data. There's more to learn and do with databases in the resources below.
        
    - **Uploading small files**Learn how to send and attach files up to 20 MB using the Notion API.[Suggest Edits](https://developers.notion.com/edit/uploading-small-files)
        
        The **Direct Upload** method lets you securely upload private files to Notion-managed storage via the API. Once uploaded, these files can be reused and attached to pages, blocks, or database properties.
        
        This guide walks you through the upload lifecycle:
        
        1. Create a file upload object
        2. Send the file content to Notion
        3. Attach the file to content in your workspace
        
        💡 **Tip**: Upload once, attach many times. You can reuse the same `file_upload` ID across multiple blocks or pages.
        
        ---
        
        ## **Step 1: Create a File Upload object**
        
        Before uploading any content, start by creating a [File Upload object](https://developers.notion.com/reference/file-upload). This returns a unique `id` and `upload_url` used to send the file.
        
        **🧠 Tip:** Save the `id` — You’ll need it to upload the file in Step 2 and attach it in Step 3.
        
        ### **Example requests**
        
        This snippet sends a `POST` request to create the upload object.
        
        cURLpython
        
        `curl --request POST \
          --url 'https://api.notion.com/v1/file_uploads' \
          -H 'Authorization: Bearer ntn_****' \
          -H 'Content-Type: application/json' \
          -H 'Notion-Version: 2022-06-28' \
          --data '{}'`
        
        ### **Example Response**
        
        JSON
        
        `{
          "object": "file_upload",
          "id": "a3f9d3e2-1abc-42de-b904-badc0ffee000",
          "created_time": "2025-04-09T22:26:00.000Z",
          "last_edited_time": "2025-04-09T22:26:00.000Z",
          "expiry_time": "2025-04-09T23:26:00.000Z",
          "upload_url": "https://api.notion.com/v1/file_uploads/a3f9d3e2-1abc-42de-b904-badc0ffee000/send",
          "archived": false,
          "status": "pending",
          "filename": null,
          "content_type": null,
          "content_length": null,
          "request_id": "b7c1fd7e-2c84-4f55-877e-d3ad7db2ac4b"
        }`
        
        ## **Step 2: Upload file contents**
        
        Next, use the `upload_url` or File Upload object `id` from Step 1 to send the binary file contents to Notion.
        
        **Tips**:
        
        - The only required field is the file contents under the `file` key.
        - Unlike other Notion APIs, the Send File Upload endpoint expects a Content-Type of multipart/form-data, not application/json.
        - Include a boundary in the `Content-Type` header [for the Send File Upload API] as described in [RFC 2388](https://datatracker.ietf.org/doc/html/rfc2388) and [RFC 1341](https://www.w3.org/Protocols/rfc1341/7_2_Multipart.html).Most HTTP clients (e.g. `fetch`, `ky`) handle this automatically if you include `FormData` with your file and don't pass an explicit `Content-Type` header.
        
        ### **Example requests**
        
        This uploads the file directly from your local system.
        
        curljavascriptPython
        
        `curl --request POST \
          --url 'https://api.notion.com/v1/file_uploads/a3f9d3e2-1abc-42de-b904-badc0ffee000/send' \
          -H 'Authorization: Bearer ntn_****' \
          -H 'Notion-Version: 2022-06-28' \
          -H 'Content-Type: multipart/form-data' \
          -F "file=@path/to-file.gif"`
        
        ### **Example response**
        
        JSON
        
        `{
          "object": "file_upload",
          "id": "a3f9d3e2-1abc-42de-b904-badc0ffee000",
          "created_time": "2025-04-09T22:26:00.000Z",
          "last_edited_time": "2025-04-09T22:27:00.000Z",
          "expiry_time": "2025-04-09T23:26:00.000Z",
          "archived": false,
          "status": "uploaded",
          "filename": "Really funny.gif",
          "content_type": "image/gif",
          "content_length": "4435",
          "request_id": "91a4ee8c-61f6-4c27-bd41-09aa35299929"
        }`
        
        > ⏳Reminder
        > 
        > 
        > Files must be attached within **1 hour** of upload or they’ll be automatically moved to an `archived` status.
        > 
        
        ## **Step 3: Attach the file to a page or block**
        
        Once the file’s `status` is `uploaded`, it can be attached to any location that supports file objects using the File Upload object `id`.
        
        This step uses standard Notion API endpoints; there’s no special upload-specific API for attaching. Just pass a file object with a type of `file_upload` and include the `id` that you received earlier in Step 1.
        
        You can use the file upload `id` with the following APIs:
        
        1. [Create a page](https://developers.notion.com/reference/post-page)
            - Attach files to a database property with the `files` type
            - Include uploaded files in `children` blocks (e.g., file/image blocks inside a new page)
        2. [Update page properties](https://developers.notion.com/reference/patch-page)
            - Update existing `files` properties on a database page
            - Set page `icon` or `cover`
        3. [Append block children](https://developers.notion.com/reference/patch-block-children)
            - Add a new block to a page — like a file, image, audio, video, or PDF block that uses an uploaded file
        4. [Update a block](https://developers.notion.com/reference/update-a-block)
            - Change the file attached to an existing file block (e.g., convert an image with an external URL to one that uses a file uploaded via the API)
        
        ### **Example: add an image block to a page**
        
        This example uses the [Append block children](https://developers.notion.com/reference/patch-block-children) API to create a new image block in a page and attach the uploaded file.
        
        cURLPython
        
        `curl --request PATCH \
        	--url "https://api.notion.com/v1/blocks/$PAGE_OR_BLOCK_ID/children" \
        	-H "Authorization: Bearer ntn_*****" \
        	-H 'Content-Type: application/json' \
        	-H 'Notion-Version: 2022-06-28' \
        	--data '{
        		"children": [
        			{
        				"type": "image",
        				"image": {
        					"caption": [],
        					"type": "file_upload",
        					"file_upload": {
        						"id": "'"$FILE_UPLOAD_ID'""
        					}
        				}
        			}
        		]
        	}'`
        
        ### **Example: add a file block to a page**
        
        example uses the [Append block children](https://developers.notion.com/reference/patch-block-children) API to create a new file block in a page and attach the uploaded file.
        
        cURL
        
        `curl --request PATCH \
          --url "https://api.notion.com/v1/blocks/$PAGE_OR_BLOCK_ID/children" \
          -H "Authorization: Bearer ntn_*****" \
          -H 'Content-Type: application/json' \
          -H 'Notion-Version: 2022-06-28' \
          --data '{
        	  "children": [
        		  {
        			  "type": "file",
        			  "file": {
        				  "type": "file_upload",
        				  "file_upload": {
        					  "id": "'"$FILE_UPLOAD_ID"'"
        				  }
        			  }
        		  }
        	  ]
          }'`
        
        ### **Example: attach a file property to a page in a database**
        
        This example uses the [Update page properties](https://developers.notion.com/reference/patch-page) API to ad the uploaded file to a `files` property on a page that lives in a Notion database.
        
        cURL
        
        `curl --request PATCH \
          --url "https://api.notion.com/v1/pages/$PAGE_ID" \
          -H 'Authorization: Bearer ntn_****' \
          -H 'Content-Type: application/json' \
          -H 'Notion-Version: 2022-06-28' \
          --data '{
            "properties": {
              "Attachments": {
                "type": "files",
                "files": [
                  {
                    "type": "file_upload",
                    "file_upload": { "id": "9a8b7c6d-1e2f-4a3b-9e0f-a1b2c3d4e5f6" },
                    "name": "logo.png"
                  }
                ]
              }
            }
          }'`
        
        ### **Example: Set a page cover**
        
        This example uses the [Update page properties](https://developers.notion.com/reference/patch-page) API to add the uploaded file as a page cover.
        
        cURL
        
        `curl --request PATCH \
          --url "https://api.notion.com/v1/pages/$PAGE_ID" \
          -H 'Authorization: Bearer ntn_****' \
          -H 'Content-Type: application/json' \
          -H 'Notion-Version: 2022-06-28' \
          --data '{
        	  "cover": {
        		  "type": "file_upload",
        		  "file_upload": {
        			  "id": "'"$FILE_UPLOAD_ID"'"
        		  }
        	  }
          }'`
        
        **✅ You’ve successfully uploaded and attached a file using Notion’s Direct Upload method.**
        
        ---
        
        ## **File lifecycle and reuse**
        
        When a file is first uploaded, it has an `expiry_time`, one hour from the time of creation, during which it must be attached.
        
        Once attached to any page, block, or database in your workspace:
        
        - The `expiry_time` is removed.
        - The file becomes a permanent part of your workspace.
        - The `status` remains `uploaded`.
        
        Even if the original content is deleted, the `file_upload` ID remains valid and can be reused to attach the file again.
        
        Currently, there is no way to delete or revoke a file upload after it has been created.
        
        ## **Downloading an uploaded file**
        
        Attaching a file upload gives you access to a temporary download URL via the Notion API.
        
        These URLs expire after 1 hour.
        
        To refresh access, re-fetch the page, block, or database where the file is attached.
        
        📌 **Tip:** A file becomes persistent and reusable after the first successful attachment — no need to re-upload.
        
        ## **Tips and troubleshooting**
        
        - **URL expiration**: Notion-hosted files expire after 1 hour. Always re-fetch file objects to refresh links.
        - **Attachment deadline**: Files must be attached within 1 hour of upload, or they’ll expire.
        - **Size limit**: This guide only supports files up to 20 MB. Larger files require a [multi-part upload](https://developers.notion.com/docs/sending-larger-files).
        - **Block type compatibility**: Files can be attached to image, file, video, audio, or pdf blocks — and to `files` properties on pages.
    - **Retrieving existing files**Learn how to get a download link for files in the Notion API.[Suggest Edits](https://developers.notion.com/edit/retrieving-files)
        
        Files, images, and other media enrich your Notion workspace — from embedded screenshots and PDFs to page covers, icons, and file properties in databases.
        
        The Notion API makes it easy to retrieve existing files, so your integration can read and reference media programmatically.
        
        This guide walks you through how to retrieve files that already exist in your workspace (typically added via the UI).
        
        ---
        
        ## **🔍 What are file objects in Notion?**
        
        In the Notion API, files are represented as [file objects](https://developers.notion.com/reference/file-object). These can appear in blocks (like images, files, videos), page covers or icons, or as part of a `files` property in a database.
        
        Each file object has a `type`, which is determined by how the file is stored:
        
        - `external`: A public URL to a file hosted elsewhere (e.g., CDN)
        - `file`: A file manually uploaded via the Notion UI
        - `file_upload`: A file uploaded programmatically via the API (which becomes a `file` after attachment)
        
        You can retrieve these file objects through API endpoints like [Retrieve a page](https://developers.notion.com/reference/retrieve-a-page), [Retrieve block children](https://developers.notion.com/reference/get-block-children), or [Retrieve page property item](https://developers.notion.com/changelog/retrieve-page-property-values). Let's start there.
        
        ## **Retrieve files in your workspace**
        
        Most files already added in your Notion workspace (like uploaded images, PDF blocks, or file properties) are `file` type objects. These include a temporary URL you can use to download the file.
        
        To retrieve files:
        
        ### **A. From page content**
        
        Use the [Retrieve block children](https://developers.notion.com/reference/get-block-children) endpoint to list blocks on a page:
        
        Bash
        
        `curl --request GET \
          --url 'https://api.notion.com/v1/blocks/{block_id}/children' \
          --header 'Authorization: Bearer {YOUR_API_KEY}' \
          --header 'Notion-Version: 2022-06-28'`
        
        If the page has image, video, or file blocks, they’ll look like this:
        
        JSON
        
        `{
          "type": "file",
          "file": {
            "url": "https://s3.us-west-2.amazonaws.com/secure.notion-static.com/...",
            "expiry_time": "2025-04-24T22:49:22.765Z"
          }
        }`
        
        **Note**: The `url` is a temporary signed link that expires after 1 hour. Re-fetch the page to refresh it.
        
        ### **B. From database properties**
        
        Use the [Retrieve a page](https://developers.notion.com/reference/retrieve-a-page) endpoint to get a database item with file properties:
        
        Bash
        
        `curl --request GET \
          --url 'https://api.notion.com/v1/pages/{page_id}' \
          --header 'Authorization: Bearer {YOUR_API_KEY}' \
          --header 'Notion-Version: 2022-06-28'`
        
        The `properties` field will include any file attachments in the `files` type:
        
        JSON
        
        `"Files & media": {
          "type": "files",
          "files": [
            {
              "type": "file",
              "file": {
                "url": "https://s3.us-west-2.amazonaws.com/...",
                "expiry_time": "2025-04-24T22:49:22.765Z"
              },
              "name": "Resume.pdf"
            }
          ]
        }`
        
    - **Uploading larger files**Learn how to send files larger than 20 MB in multiple parts.[Suggest Edits](https://developers.notion.com/edit/sending-larger-files)
        
        API bots in paid workspaces can use File Uploads in multi-part mode to upload files up to 5 GB. To do so, follow the steps below.
        
        ## **Step 1: Split the file into parts**
        
        To send files larger than 20 MB, split them up into segments of 5-20 MB each. On Linux systems, one tool to do this is the [`split` command](https://phoenixnap.com/kb/linux-split). In other toolchains, there are libraries such as [`split-file` for TypeScript](https://github.com/tomvlk/node-split-file) to generate file parts.
        
        ShellTypeScript
        
        `# Split `largefile.txt` into 10MB chunks, named as follows:
        # split_part_aa, split_part_ab, etc.
        split -b 10M ./largefile.txt split_part`
        
        > 📘Convention for sizes of file parts
        > 
        > 
        > When sending parts of a file to the Notion API, each file must be ≥ 5 and ≤ 20 (binary) megabytes in size, with the exception of the final part (the one with the highest part number), which can be less than 5 MB. The `split` command respects this convention, but the tools in your tech stack might vary.
        > 
        > **To stay within the range, we recommend using a part size of 10 MB**.
        > 
        
        ## **Step 2: Start a file upload**
        
        This is similar to [Step 1 of uploading small files](https://developers.notion.com/reference/uploading-small-files#step-1), but with a few additional required parameters.
        
        Pass a `mode` of `"multi_part"` to the [Create a file upload](https://developers.notion.com/reference/create-a-file-upload) API, along with the `number_of_parts`, and a `filename` with a valid extension or a separate MIME `content_type` parameter that can be used to detect an extension.
        
        cURL
        
        `curl --request POST \
          --url 'https://api.notion.com/v1/file_uploads' \
          -H 'Authorization: Bearer ntn_****' \
          -H 'Content-Type: application/json' \
          -H  'Notion-Version: 2022-06-28' \
          --data '{
            "mode": "multi_part",
            "number_of_parts": 5,
            "filename": "image.png"
          }'`
        
        ## **Step 3: Send all file parts**
        
        Send each file part by using the [Send File Upload API](https://developers.notion.com/reference/send-a-file-upload) using the File Upload ID, or the `upload_url` in the response of the [Create a file upload](https://developers.notion.com/reference/create-a-file-upload) step.
        
        This is similar to [Step 2 of uploading small files](https://developers.notion.com/reference/uploading-small-files#step-2). However, alongside the `file`, the form data in your request must include a field `part_number` that identifies which part you’re sending.
        
        Your system can send file parts in parallel (up to standard Notion API [rate limits](https://developers.notion.com/reference/request-limits)). Parts can be uploaded in any order, as long as the entire sequence from {1, …, `number_of_parts`} is successfully sent before calling the [Complete a file upload](https://developers.notion.com/reference/complete-a-file-upload) API.
        
        ## **Step 4: Complete the file upload**
        
        Call the [Complete a file upload](https://developers.notion.com/reference/complete-a-file-upload) API with the ID of the File Upload after all parts are sent.
        
        ## **Step 5: Attach the file upload**
        
        After completing the File Upload, its status becomes `uploaded` and it can be attached to blocks and other objects the same way as file uploads created with a `mode` of `single_part` (the default setting).
        
        Using its ID, attach the File Upload (for example, to a block, page, or database) within one hour of creating it to avoid expiry.
        
        > 📘Error handling
        > 
        > 
        > The [Send](https://developers.notion.com/reference/send-a-file-upload) API validates the total file size against the [workspace's limit](https://developers.notion.com/docs/working-with-files-and-media#supported-file-types) at the time of uploading each part. However, because parts can be sent at the same time, the [Complete](https://developers.notion.com/reference/complete-a-file-upload) step re-validates the combined file size and can also return an HTTP 400 with a code of `validation_error`.
        > 
        > We recommend checking the file's size before creating the File Upload when possible. Otherwise, make sure your integration can handle excessive file size errors returned from both the Send and Complete APIs.
        > 
        > To manually test your integration, command-line tools like `head`, `dd`, and `split` can help generate file contents of a certain size and split them into 10 MB parts.
        > 
    - **Importing external files**Learn how to migrate files from an external URL to Notion.[Suggest Edits](https://developers.notion.com/edit/importing-external-files)
        
        ## **Step 1: Start a file upload**
        
        To initiate the process of transferring a temporarily-hosted public file into your Notion workspace, use the [Create a file upload](https://developers.notion.com/reference/create-a-file-upload) with a `mode` of `"external_url"`, a `filename`, and the `external_url` itself:
        
        cURL
        
        `curl --request POST \
          --url 'https://api.notion.com/v1/file_uploads' \
          -H 'Authorization: Bearer ntn_****' \
          -H 'Content-Type: application/json' \
          -H  'Notion-Version: 2022-06-28' \
          --data '{
            "mode": "external_url",
            "external_url": "https://example.com/image.png",
            "filename": "image.png"
          }'`
        
        At this step, Notion will return a `validation_error` (HTTP 400) if any of the following are true:
        
        - The URL is not SSL-enabled, or not publicly accessible.
        - The URL doesn’t expose the `Content-Type` header for Notion to verify as part of a quick `HEAD` HTTPS request.
        - The `Content-Length` header (size) of the file at the external URL exceeds your workspace’s per-file size limit.
        - You don’t provide a valid filename and a supported MIME content type or extension.
        
        ## **Step 2: Wait for the import to complete**
        
        After Step 1, Notion begins processing the file import asynchronously. To wait for the upload to finish, your integration can do one of the following:
        
        1. **Polling**. Set up your integration to wait a sequence of intervals (e.g. 5, 15, 30, and 45 seconds, or an exponential backoff sequence) after creating the File Upload and poll the [Retrieve a file upload](https://developers.notion.com/reference/retrieve-a-file-upload) until the `status` changes from `pending` to `uploaded` (or `failed`).
        2. **Listen to webhooks**. Notion will send one of the following types of [integration webhook](https://developers.notion.com/reference/webhooks) events:
            1. `file_upload.complete`
                1. The import is complete, and your integration can proceed to using the FileUpload ID in Step 3.
            2. `file_upload.upload_failed`
                1. The import failed. This is typically due to:
                    1. File size is too large for your workspace (per-file limit exceeded).
                    2. The external service temporarily hosting the file you’re importing is experiencing an outage, timing out, or requires authentication or additional headers at the time Notion’s systems retrieve your file.
                    3. The file storage service Notion uses is experiencing an outage (rare).
                2. Check the `data[file_import_result]` object for error codes and messages to help troubleshoot.
                3. Try again later or with a smaller file. You won’t be able to attach the failed File Upload to any blocks.
            3. For both success and failure, the `entity` of the webhook payload will contain a `type` of `"file_upload"` and an `id` containing the ID of the FileUpload from Step 1.
        
        ![Screenshot of webhook settings in the Notion creator profile integration settings page.](https://files.readme.io/0413bdbb8e6e8351c9d7fd9c4e855c79f258a643e4a3f51d4468e31810faba5b-image.png)
        
        Screenshot of webhook settings in the Notion creator profile integration settings page.
        
        The outcome of the file import is recorded on the [File Upload](https://developers.notion.com/reference/file-upload) object. If the import fails, the status changes to `failed`. If it succeeds, the status changes to `uploaded`.
        
        For example, in response to a `file_upload.upload_failed` webhook, your system can read the `data.file_import_result.error` from the webhook response, or use the [Retrieve a file upload](https://developers.notion.com/reference/retrieve-a-file-upload) API and check the `file_import_result.error` to debug the import failure:
        
        TypeScript
        
        `// GET /v1/file_uploads/:file_upload_id
        // --- RETURNS -->
        {
          "object": "file_upload",
          // ...
          "status": "failed",
          "file_import_result": {
            "type": "error",
            "error": {
              "type": "validation_error",
              "code": "file_upload_invalid_size",
              "message": "The file size is not within the allowed limit of 5 MiB. Please try again with a new file upload.",
              "parameter": null,
              "status_code": null
            },
          }
        }`
        
        The `file_import_result` object contains details on the `success` or `error`. In this example, the problem is a file size validation issue that wasn’t caught during Step 1—potentially because the external host did not provide a `Content-Length` header for Notion to validate with a `HEAD` request. The same file size limits of 5 MiB for a free workspace and 5 GiB for a paid workspace apply to external URL mode.
        
        A file upload with a status of `failed` cannot be reused, and a new one must be created.
        
        ## **Step 3: Attach the file upload**
        
        Using its ID, attach the File Upload (for example, to a block, page, or database) within one hour of creating it to avoid expiry.
        
    - **Working with comments**Learn how to add and retrieve comments with the Notion API.[Suggest Edits](https://developers.notion.com/edit/working-with-comments)
        
        # **Overview**
        
        Notion offers the ability for developers to add [comments](https://www.notion.so/help/comments-mentions-and-reminders) to pages and page content (i.e. [blocks](https://developers.notion.com/docs/working-with-page-content#modeling-content-as-blocks)) within a workspace. Users may add comments:
        
        - To the top of a page.
        - Inline to text or other [blocks](https://developers.notion.com/docs/working-with-page-content#modeling-content-as-blocks) within a page.
        
        > 📘
        > 
        > 
        > When using the public API, inline comments can be used to respond to *existing* [discussions](https://developers.notion.com/docs/working-with-comments#responding-to-a-discussion-thread).
        > 
        
        ![Notion UI with a page comment and inline comment added.](https://files.readme.io/bec3d37-Screen_Shot_2023-05-22_at_3.38.28_PM.png)
        
        The Notion UI with a page and inline/block comment added.
        
        This guide will review how to use the public REST API to add and retrieve comments on a page. It will also look at considerations specific to [integrations](https://www.notion.so/help/add-and-manage-connections-with-the-api) when retrieving or adding comments.
        
        ## **Permissions**
        
        Before discussing how to use the public REST API to interact with comments, let’s first review who can comment on a page. Notion relies on a tiered system for [page permissions](https://www.notion.so/help/sharing-and-permissions#permission-levels), which can vary between:
        
        - `Can view`
        - `Can comment`
        - `Can edit`
        - `Full access`
        
        When using the Notion UI, users must have `Can comment` access or higher (i.e. less restricted) to add comments to a page.
        
        [Integrations](https://developers.notion.com/docs/getting-started#what-is-a-notion-integration) must also have comment permissions, which can be set in the [Integrations dashboard](https://notion.so/my-integrations).
        
        > 📘
        > 
        > 
        > Integrations are apps developers build to use the public API within a Notion workspace. Integrations must be given explicit permissions to read/write content in a workspace, included content related to comments.
        > 
        
        ### **Integration comments capabilities**
        
        To give your integration permission to interact with comments via the public REST API, you need to configure the integration to have comment capabilities.
        
        There are two relevant capabilities when it comes to comments — the ability to:
        
        1. Read comments.
        2. Write (or insert) comments.
        
        You can edit your integration's capabilities in the [Integrations dashboard](https://notion.so/my-integrations). If these capabilities are not added to your integration, REST API requests related to comments will respond with an error.
        
        ![Configuring capabilities on the integration settings page.](https://files.readme.io/497c553-Configuring_capabilities_on_the_integration_settings_page.png)
        
        Configuring capabilities on the integration settings page.
        
        See our reference guide on [Capabilities](https://developers.notion.com/reference/capabilities) for more information.
        
        ## **Comments in Notion’s UI vs. using the REST API**
        
        In the Notion UI, users can:
        
        - Add a comment to a page.
        - Add an inline comment to child blocks on the page (i.e. comment on page content).
        - Respond to an inline comment (i.e. add a comment to an existing discussion thread).
        - Read open comments on a page or block.
        - Read/re-open resolved comments on a page or block.
        - Edit comments.
        
        ✅ Using the public REST API, integrations **can**:
        
        - Add a comment to a page.
        - Respond to an inline comment (i.e. add a comment to an existing discussion thread).
        - Read open comments on a block or page.
        
        ❌ When using the public REST API, integrations **cannot**:
        
        - Start a new discussion thread.
        - Edit existing comments.
        - Retrieve resolved comments.
        
        > 👍
        > 
        > 
        > Keep an eye on our [Changelog](https://developers.notion.com/page/changelog) for new features and updates to the REST API.
        > 
        
        # **Retrieving comments for a page or block**
        
        The [Retrieve comments](https://developers.notion.com/reference/retrieve-a-comment) endpoint can be used to list all open (or “un-resolved”) comments for a page or block. Whether you’re retrieving comments for a page or block, the `block_id` query parameter is used. This is because [pages are technically blocks](https://developers.notion.com/docs/working-with-page-content).
        
        This endpoint returns a flatlist of comments associated with the ID provided; however, some block types may support multiple discussion threads. This means there may be multiple discussion threads included in the response. When this is the case, comments from all discussion threads will be returned in ascending chronological order. The threads can be distinguished by sorting them `discussion_id` field on each comment object.
        
        cURLJavaScript
        
        `curl 'https://api.notion.com/v1/comments?block_id=5c6a28216bb14a7eb6e1c50111515c3d'\
          -H 'Authorization: Bearer '"$NOTION_API_KEY"'' \
          -H "Notion-Version: 2022-06-28"`
        
        By default, the response from this endpoint will return a maximum of 100 items. To retrieve additional items, you will need to use [pagination](https://developers.notion.com/reference/intro#pagination).
        
        # **Adding a comment to a page**
        
        You can add a top-level comment to a page by using the [Add comment to page](https://developers.notion.com/reference/create-a-comment) endpoint. Requests made to this endpoint require the ID for the parent page, as well as a [rich text](https://developers.notion.com/reference/rich-text) body (i.e. the comment content).
        
        ShellJavaScript
        
        `curl -X POST https://api.notion.com/v1/comments \
          -H 'Authorization: Bearer '"$NOTION_API_KEY"'' \
          -H "Content-Type: application/json" \
          -H "Notion-Version: 2022-06-28" \
          --data '
          {
            "parent": {
              "page_id": "59e3eb41-33b2-4151-b05b-31115a15e1c2"
            },
            "rich_text": [
              {
                "text": {
                  "content": "Hello from my integration."
                }
              }
            ]
          }
          '`
        
        The response will contain the new [comment object](https://developers.notion.com/reference/comment-object).
        
        The exception to what will be returned occurs if your integration has “write comment” capabilities but not “read comment” capabilities. In this situation, the response will be a partial object consisting of only the `id` and `object` fields. This is because the integration can create new comments but can’t retrieve comments, even if the retrieval is just the response for the newly created one. (Reminder: You can update the read/write settings in the [Integrations dashboard](https://notion.so/my-integrations).)
        
        In the Notion UI, this new comment will be displayed on the page using your integration's name and icon.
        
        # **Inline comments**
        
        ## **Responding to a discussion thread**
        
        The [Add comment to page](https://developers.notion.com/reference/create-a-comment) endpoint can also be used to respond to a discussion thread on a block. (Reminder: Page blocks are the child elements that make up the page content, like a paragraph, header, to-do list, etc.)
        
        If you’re using this endpoint to respond to a discussion, you will need to provide a `discussion_id` parameter *instead of* a `parent.page_id`.
        
        > 📘
        > 
        > 
        > Inline comments cannot be directly added to blocks to start a new discussion using the public API. Currently, the API can only be used to respond to inline comments (discussions).
        > 
        
        ### **Retrieving a discussion ID**
        
        The are two possible ways to get the `discussion_id` for a discussion thread.
        
        1. You can use the [Retrieve comments](https://developers.notion.com/reference/retrieve-a-comment) endpoint, which will return a list of open comments on the page or block.
        2. You can also get a `discussion_id` manually by navigating to the page with the discussion you’re responding to. Next, click the "Copy link to discussion" menu option next to the discussion.
        
        !["Copy link to discussion" menu option in Notion UI.](https://files.readme.io/8536d28-Screen_Shot_2023-05-22_at_7.27.12_PM.png)
        
        "Copy link to discussion" menu option in Notion UI.
        
        This will give you a URL like:
        
        ```
        https://notion.so/Something-something-a8d5215b89ae464b821ae2e2916ab9ce?d=5e73b63447c2428fa899e906b1f1d20e#b3e87b2b5e114cbd99f96288c22bacce
        
        ```
        
        The value of the `d` query parameter is the `discussion_id`.
        
        Once you have the `discussion_id`, you can make a request to respond to the thread like so:
        
        cURLJavaScript
        
        `curl -X POST https://api.notion.com/v1/comments \
          -H 'Authorization: Bearer '"$NOTION_API_KEY"'' \
          -H "Content-Type: application/json" \
          -H "Notion-Version: 2022-06-28" \
          --data '
          {
            "discussion_id": "59e3eb41-33b2-4151-b05b-31115a15e1c2",
            "rich_text": [
              {
                "text": {
                  "content": "Hello from my integration."
                }
              }
            ]
          }
          '`
        
        # **Conclusion**
        
        In this guide, you learned about comment permissions and how to interact with page and block-level comments using Notion’s public REST API. There are many potential use-cases for this type of interaction, such as:
        
        - Commenting on a task when a related pull request is merged.
        - Periodically pasting reminders to any pages that meet a certain criteria. For example, you could use the [Query a database](https://developers.notion.com/reference/post-database-query) endpoint to search for a certain criteria and add a comment to any pages that do.
        - For apps that use Notion as a CMS (Content Management System) — like a blog — users can give feedback to pages by adding a comment.